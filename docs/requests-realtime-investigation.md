# Investigation: `requests/*` realtime vs squashed migrations (`529b80b`)

## Mitigation (implemented)

**Web Push** in [`pb_hooks/push_notify_requests.pb.js`](../pb_hooks/push_notify_requests.pb.js) now uses **`onCollectionAfterCreateSuccess`** and **`onCollectionAfterUpdateSuccess`** instead of **`onRecordAfterCreateSuccess`** / **`onRecordAfterUpdateSuccess`** on **`requests`**. That preserves **`requests/*` SSE** alongside push on PocketBase **0.37.x** (see [`docs/PROXMOX.md`](PROXMOX.md)).

## Executive summary

Symptom (**unchanged from your environment**): SSE subscribe to `requests/*` returns **204**, but **no create/update events** arrive, while `storages/*` still receives updates.

**This is not caused by the squashed migration** (`1746612000000_initial_schema.js`). On **PocketBase 0.37.5**, a **fresh database** created from the **current** migrations shows **working** `requests/*` realtime **as long as record-scoped `onRecordAfterCreateSuccess` / `onRecordAfterUpdateSuccess` hooks are not registered for `requests`**.

The regression correlates with **`pb_hooks`**: **`onRecordAfterCreateSuccess`** (and **`onRecordAfterUpdateSuccess`**) on **`requests`** (including a **no-op** AfterCreate handler) causes the server log line `Realtime connection closed (cancelled request)` for the subscribing client when a request is created or updated, so **`requests/*` SSE** can fail. **`onCollectionAfter*Success`** for the same collection does **not** reproduce that disconnect in testing.

Previously, `push_notify_requests.pb.js` used the record-scoped handlers; switching to collection-scoped hooks restores realtime **and** keeps Web Push.

## Phase 1 — Static diff (pre-crush vs squashed)

At `529b80b^`, migrations were:

| File | Role |
|------|------|
| `1746612000000_stock_request_schema.js` | Bars, `users.role` / `users.bar`, `requests` (no multi-hub yet) |
| `1746612001000_requests_requested_at.js` | Adds `requested_at` |
| `1746612002000_requests_done_by_nickname.js` | Adds `done_by_nickname` |
| `1746612003000_users_admin_list_rule.js` | Admin list/view rules on `users` |
| `1746612004000_storages_multi_hub.js` | `storages`, `users.storage`, `requests.storage` + `storage_name`, tighten createRule |

Squashed `1746612000000_initial_schema.js` merges that **logical end state**, with **`hub_order`** instead of **`sort`** on storages (see comment in migration: PB rejects reserved/problematic names).

Meaningful rule deltas vs **first** stock migration:

- **`requests.listRule` / `viewRule`**: squashed form explicitly allows **`storage`** role scoped with `storage = @request.auth.storage` (multi-hub parity).
- **`requests.createRule`**: squashed adds **`storage != ""`** and **`storage_name != ""`** (matches multi-hub migration intent).

No `options` keys were added on `requests` / `storages` in SQLite after migrate (both stayed `{}`).

## Phase 2 — Two fresh databases (migrations-only)

- **Current squashed migrations**: `pocketbase migrate up` + **`serve` without `--hooksDir`** → SSE test: **`requests/*` create event received** (Python client saw `action: "create"`).
- **Pre-squash chain replay on PB 0.37.5**: **blocked** — `1746612004000_storages_multi_hub.js` defines a number field named **`sort`**, which PB **0.37.5 rejects** (`sort: cannot be blank` / invalid identifier). A side-by-side “old vs new” SSE run on the **same binary** is therefore **not reproducible** without rewriting that historical file for 0.37.5 or using an older PocketBase build from the original era.

Conclusion: migration squash **cannot be validated** via full old-chain replay on the **pinned** Docker `PB_VER=0.37.5`; functional evidence instead comes from **squashed-only fresh DB + realtime** (works) and hook bisect (below).

## Phase 3 — SQLite (`_collections`)

On a migrated DB (`requests`, `storages`):

- **`options`**: `{}` for both collections.
- **`listRule` / `viewRule`** match the migration source (no hidden JSON-only flags observed).

A second DB from the **historic** migrations was not produced (see Phase 2), so row-by-row JSON diff against “pre-squash final” was not completed in SQLite.

## Phase 4 — “Narrow regression” outcome

bisect pointed away from **`initial_schema`** and toward **`pb_hooks`**:

| Hooks loaded | `requests/*` create SSE |
|--------------|-------------------------|
| None | Yes |
| Only `requests_set_requested_at.pb.js` (`onRecordCreateRequest`) | Yes |
| Only `push_notify_requests.pb.js` + `push_notify_helpers.js` (`onRecordAfterCreateSuccess`) | No |
| All `.pb.js` **except** `push_notify_requests.pb.js` | Yes |
| All **except** `requests_set_requested_at.pb.js` (push still present) | No |

Minimal reproduction: **`onRecordAfterCreateSuccess((e) => {}, 'requests')`** alone → **`requests/*` SSE still broken** → not specific to push HTTP / missing `push_subscriptions` table; the **hook type + collection** pair triggers `Realtime connection closed (cancelled request)` in server DEBUG logs.

## Phase 5 — Hooks control (`--hooksDir`)

- **Without `--hooksDir`**: realtime for `requests` works on a squashed schema.
- **With `--hooksDir`** using **`onRecordAfterCreateSuccess` / `onRecordAfterUpdateSuccess`** on **`requests`**: realtime for `requests` fails as above (`storages/*` still works). **Collection-scoped `onCollectionAfter*Success`** avoids the disconnect while still running push logic.

Production-style command lines (Makefile / `docker-entrypoint.sh`) use **`--hooksDir=/pb/pb_hooks`**; ensure deployed hooks match the collection-scoped variant in this repo.

## Recommended next steps

1. **Mitigation applied**: use **`onCollectionAfterCreateSuccess`** / **`onCollectionAfterUpdateSuccess`** in [`pb_hooks/push_notify_requests.pb.js`](../pb_hooks/push_notify_requests.pb.js) (see **Mitigation** above). Optionally file a **PocketBase 0.37.x** issue for record-scoped After* hooks cancelling `requests/*` subscribers.
2. No evidence that existing installs need **SQLite surgery** on `_collections` for `requests` to fix SSE; the schema row looks normal.
3. Optional: if you need strict A/B on **old migration chain**, either relax `sort` → `hub_order` in a **throwaway** copy of historical migrations for 0.37.5 or run the old files against the PB version that originally accepted `sort`.

## Local reproduction notes (dev-only)

Tests used `/tmp/pocketbase_0.37.5/pocketbase`, empty `PUBLIC_VAP`-irrelevant flags, seeded `*_test.local` users. Do not reuse passwords outside `tmp`; stop any leftover `serve` listeners on investigative ports after tests.
