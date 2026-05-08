#!/usr/bin/env python3
"""
Smoke-test PocketBase SSE realtime (same API the JS SDK subscribe() uses).

Uses storage credentials to subscribe to requests/* then creates a pending request
via bar credentials. Expect an SSE payload with record action \"create\".

Example (container on host port 8888):

  python3 scripts/realtime_smoke.py \\
    --base-url http://127.0.0.1:8888 \\
    --storage-email storage@example.com --storage-password '...' \\
    --bar-email bar@example.com --bar-password '...'

REST sanity (curl): curl -sS -i http://127.0.0.1:8888/api/health
"""

from __future__ import annotations

import argparse
import http.client
import json
import queue
import threading
import time
from dataclasses import dataclass
from typing import BinaryIO
from urllib.parse import urlparse


def read_sse_event(fp: BinaryIO) -> dict[str, str] | None:
    fields: dict[str, str] = {}
    while True:
        raw = fp.readline()
        if not raw:
            return None
        line = raw.rstrip(b"\r\n")
        if line == b"":
            if not fields:
                continue
            return fields
        if line.startswith(b":"):
            continue
        key, sep, rest = line.partition(b":")
        name = key.decode("utf-8", errors="replace").strip().lower()
        value = (
            rest.decode("utf-8", errors="replace").lstrip() if sep else ""
        ).lstrip()
        if name == "data" and name in fields:
            fields[name] = fields[name] + "\n" + value
        else:
            fields[name] = value


@dataclass
class PbAuth:
    token: str
    record: dict


def pb_auth(base: str, identity: str, password: str) -> PbAuth:
    body = json.dumps({"identity": identity, "password": password}).encode("utf-8")
    parsed = urlparse(base)
    conn = http.client.HTTPConnection(parsed.hostname or "", parsed.port or 80)
    path = "/api/collections/users/auth-with-password"
    headers = {"Content-Type": "application/json"}
    conn.request("POST", path, body=body, headers=headers)
    res = conn.getresponse()
    raw = res.read().decode("utf-8")
    conn.close()
    if res.status != 200:
        raise SystemExit(f"auth-with-password failed {res.status}: {raw[:500]}")
    data = json.loads(raw)
    token = data.get("token")
    rec = data.get("record")
    if not token or not isinstance(rec, dict):
        raise SystemExit("auth response missing token or record")
    return PbAuth(str(token), rec)


def http_request(
    base: str,
    method: str,
    api_path: str,
    *,
    token: str | None = None,
    body_obj: dict | list | None = None,
) -> tuple[int, bytes]:
    parsed = urlparse(base)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    conn_cls = (
        http.client.HTTPSConnection
        if parsed.scheme == "https"
        else http.client.HTTPConnection
    )
    conn = conn_cls(parsed.hostname or "", port)
    data = json.dumps(body_obj).encode("utf-8") if body_obj is not None else None
    headers = {"Content-Type": "application/json"}
    # PocketBase REST: Authorization header carries the JWT.
    hdr = _auth_header_value(token)
    if hdr:
        headers["Authorization"] = hdr
    conn.request(method, api_path, body=data, headers=headers)
    res = conn.getresponse()
    out = res.read()
    conn.close()
    return res.status, out


def _auth_header_value(token: str | None) -> str | None:
    if not token:
        return None
    t = token.strip()
    lower = t.lower()
    return t if lower.startswith("bearer ") else f"Bearer {t}"


def sse_listener(
    base: str,
    out_q: "queue.Queue[dict[str, str] | Exception]",
) -> None:
    parsed = urlparse(base)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        conn_cls = (
            http.client.HTTPSConnection
            if parsed.scheme == "https"
            else http.client.HTTPConnection
        )
        conn = conn_cls(parsed.hostname or "", port, timeout=120)
        conn.request("GET", "/api/realtime", headers={"Accept": "text/event-stream"})
        resp = conn.getresponse()
        if resp.status != 200:
            body = resp.read()
            conn.close()
            out_q.put(
                RuntimeError(f"SSE connect failed HTTP {resp.status}: {body[:400]!r}")
            )
            return
        while True:
            ev = read_sse_event(resp)
            if ev is None:
                break
            out_q.put(ev)
        conn.close()
    except Exception as e:
        out_q.put(e)


def wait_connect_client_id(ev_q: "queue.Queue", deadline: float) -> str:
    while time.monotonic() < deadline:
        try:
            got = ev_q.get(timeout=min(2.0, max(0.0, deadline - time.monotonic())))
        except queue.Empty:
            continue
        if isinstance(got, Exception):
            raise got
        if got.get("event") == "PB_CONNECT":
            data_raw = got.get("data", "")
            payload = json.loads(data_raw)
            cid = payload.get("clientId")
            if cid:
                return str(cid)
    raise TimeoutError("no PB_CONNECT/clientId before deadline")


def expect_request_event(ev_q: "queue.Queue", deadline: float, want_action: str) -> dict:
    while time.monotonic() < deadline:
        try:
            got = ev_q.get(timeout=min(2.0, max(0.0, deadline - time.monotonic())))
        except queue.Empty:
            continue
        if isinstance(got, Exception):
            raise got
        data_raw = got.get("data") or ""
        if not data_raw.strip():
            continue
        try:
            payload = json.loads(data_raw)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and payload.get("action") == want_action:
            rec = payload.get("record") or payload.get("model")
            if isinstance(rec, dict):
                return rec
    raise TimeoutError(f"no SSE message with action={want_action!r} before deadline")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--base-url",
        default="http://127.0.0.1:8888",
        help="PocketBase origin (e.g. http://localhost:8888)",
    )
    p.add_argument("--storage-email", required=True)
    p.add_argument("--storage-password", required=True)
    p.add_argument("--bar-email", required=True)
    p.add_argument("--bar-password", required=True)
    p.add_argument(
        "--listen-seconds",
        type=float,
        default=25.0,
        help="How long to wait for the create SSE after subscribing",
    )
    args = p.parse_args()

    base = args.base_url.rstrip("/")

    print("Checking /api/health …")
    st, raw = http_request(base, "GET", "/api/health")
    if st != 200:
        raise SystemExit(f"health check failed HTTP {st}: {raw.decode()[:200]}")
    print("health OK")

    print("Authenticating storage user …")
    storage_auth = pb_auth(base, args.storage_email, args.storage_password)
    sid = storage_auth.record.get("storage")
    if not sid:
        raise SystemExit("storage user has no relation field 'storage'; fix user in Admin")
    if isinstance(sid, list):
        sid = sid[0] if sid else None
    if isinstance(sid, dict):
        sid = sid.get("id")
    sid = str(sid)
    storage_token = storage_auth.token

    print("Authenticating bar user …")
    bar_auth = pb_auth(base, args.bar_email, args.bar_password)
    bid = bar_auth.record.get("bar")
    if not bid:
        raise SystemExit("bar user has no relation field 'bar'; fix user in Admin")
    if isinstance(bid, list):
        bid = bid[0] if bid else None
    if isinstance(bid, dict):
        bid = bid.get("id")
    bid = str(bid)
    bar_token = bar_auth.token

    st, stor_raw = http_request(
        base, "GET", f"/api/collections/storages/records/{sid}", token=bar_token
    )
    if st != 200:
        raise SystemExit(
            f"could not load storage hub {sid!r}: HTTP {st} {stor_raw.decode()[:300]}"
        )
    stor = json.loads(stor_raw.decode("utf-8"))
    hub_name = str(stor.get("name") or "Storage hub")

    ev_q: queue.Queue = queue.Queue()

    listener = threading.Thread(
        target=sse_listener,
        args=(base, ev_q),
        daemon=True,
    )
    listener.start()

    t0 = time.monotonic()
    cid = wait_connect_client_id(ev_q, t0 + 20.0)
    print(f"PB_CONNECT ok clientId={cid[:12]}…")

    st, empty = http_request(
        base,
        "POST",
        "/api/realtime",
        token=storage_token,
        body_obj={"clientId": cid, "subscriptions": ["requests/*"]},
    )
    if st != 204:
        raise SystemExit(
            f"POST /api/realtime subscribe failed HTTP {st}: {empty.decode()[:500]}"
        )
    print("Subscribed storage user to requests/* (204).")

    create_body = {
        "bar": bid,
        "bar_name": "realtime_smoke.py",
        "items": [{"label": "__smoke__", "qty": 1}],
        "status": "pending",
        "storage": sid,
        "storage_name": hub_name,
        "bar_device_nickname": "script",
    }
    st, cr = http_request(
        base,
        "POST",
        "/api/collections/requests/records",
        token=bar_token,
        body_obj=create_body,
    )
    if st != 200:
        raise SystemExit(f"create request failed HTTP {st}: {cr.decode()[:500]}")
    created = json.loads(cr.decode("utf-8"))
    rid = created.get("id")
    print(f"Created request id={rid!r} as bar.")

    try:
        rec = expect_request_event(ev_q, time.monotonic() + args.listen_seconds, "create")
        evt_id = rec.get("id")
        print(f"SSE delivered create for record id={evt_id!r} (matching list rule).")
        if rid and evt_id != rid:
            print(f"Note: SSE id={evt_id!r} differs from REST create id={rid!r}")
    except TimeoutError as e:
        raise SystemExit(str(e))

    print("Smoke test OK.")


if __name__ == "__main__":
    main()
