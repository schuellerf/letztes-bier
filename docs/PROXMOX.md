# Proxmox: container template + PocketBase autocert

The vztmpl tarball is a **full root filesystem** (not a layered OCI image): **Debian Bookworm with systemd**, **ifupdown**, and **isc-dhcp-client**, so **`eth0` uses DHCP** on your Proxmox bridge—appliance-style, like a classic LXC template. PocketBase runs as **`letztes-bier.service`** after **`networking.service`**.

[Proxmox system container templates](https://pve.proxmox.com/pve-docs/chapter-pct.html) are tar archives of that rootfs; import into storage with content type **Container template** (`vztmpl`).

For **`podman run`**, the image default **`ENTRYPOINT`** is `docker-entrypoint.sh` (autocert when **`PB_DOMAIN`** is set). **`make run`** uses **`--entrypoint /pb/pocketbase`** and HTTP on **8090** for local dev.

## LXC runtime: systemd, DHCP, and PocketBase

After you create a CT from the template and start it:

1. **`/sbin/init`** is **systemd** (PID 1).
2. **`networking.service`** brings up **`eth0`** with **DHCP** (shipped `/etc/network/interfaces`). A **static IP** configured in the Proxmox UI may replace that file.
3. Set **`PB_DOMAIN`** in **`/etc/default/letztes-bier`**, then restart:

   ```bash
   nano /etc/default/letztes-bier   # e.g. PB_DOMAIN=beer.example.com
   systemctl restart letztes-bier.service
   ```

   Until `PB_DOMAIN` is set, the unit may fail or Let’s Encrypt will not succeed.

4. Prefer a **privileged** CT for least friction with systemd inside LXC; if boot stalls, try **nesting** or **privileged** under **Features**. See [Linux Container](https://pve.proxmox.com/wiki/Linux_Container).

### Console and logs

The unit uses **`StandardOutput=journal+console`**. The GUI **Console** often uses **`cmode: tty`**; for messages on the VM **console** device, set **`cmode: console`** on the CT ([pct docs](https://pve.proxmox.com/pve-docs/chapter-pct.html)). Follow logs with:

```bash
pct exec <VMID> -- journalctl -u letztes-bier.service -f
```

With **`PB_DOMAIN`** set, PocketBase uses **Let’s Encrypt** (autocert) on **80** and **443**. See [Going to production](https://pocketbase.io/docs/going-to-production/).

### First superuser when HTTPS looks “wrong”

The log line about creating the first superuser usually points at **`https://<domain>/_/`**. If the certificate is not yet a valid **public** one (Let’s Encrypt still failing, hostname mismatch, or port **80** not reachable for the HTTP-01 check), the browser warns and the installer is painful to use.

**Create the superuser from the CT instead** (no browser):

```bash
pct exec <VMID> -- systemctl stop letztes-bier.service
pct exec <VMID> -- /pb/pocketbase --dir=/pb/pb_data superuser upsert 'admin@example.com' 'Choose-a-long-password'
pct exec <VMID> -- systemctl start letztes-bier.service
```

Use your real email and a strong password; **`upsert`** is safe to run again later. Stop **`letztes-bier`** first so only one process touches **`pb_data`**.

PocketBase documents this flow under *Going to production* (“create the first superuser explicitly via the **`superuser`** … command”).

### TLS / Let’s Encrypt (why logs stay quiet)

Autocert does not always print a loud “trying Let’s Encrypt” line. Check the same journal; failures often appear as errors when issuance or renewal breaks.

Confirm:

1. **`PB_DOMAIN`** in **`/etc/default/letztes-bier`** matches exactly what you type in the browser (no `http://`, no trailing slash).
2. **DNS** for that name points at this CT’s **public** address.
3. **TCP 80** (and **443**) from the **internet** reach the CT (router + Proxmox datacenter/host/CT firewall). HTTP-01 must succeed on **80**.
4. After fixing issues, restart: **`systemctl restart letztes-bier.service`**, then wait a short time and reload **`https://<PB_DOMAIN>/_/`**.

Optional checks from your laptop:

```bash
dig +short YOUR_PUBLIC_DOMAIN
curl -sS -I "http://YOUR_PUBLIC_DOMAIN/" | head -5
```

You should at least see **PocketBase** answering on **:80** (often a redirect to **https://**).

### Web Push relay (`letztes-bier-push`)

The image ships **`letztes-bier-push`**: a small **HTTP** relay on **`127.0.0.1:8787`** (default) that sends **Web Push** notifications using **VAPID**. The systemd unit is **enabled for multi-user.target** (starts with the CT). Fill **`/etc/default/letztes-bier-push`** before or right after first boot; if required variables are empty, the service **exits** and systemd retries a few times then stops (**`systemctl reset-failed`** after you fix the file, then **`systemctl start letztes-bier-push`**).

1. Edit **`/etc/default/letztes-bier-push`**: set **`PUSH_INTERNAL_TOKEN`** (long random string), **`VAPID_PUBLIC_KEY`** / **`VAPID_PRIVATE_KEY`** (e.g. `npx web-push generate-vapid-keys`), and **`VAPID_SUBSCRIBER`** (a `mailto:` contact for push providers).
2. If it was already failing: **`systemctl reset-failed letztes-bier-push.service`** and **`systemctl restart letztes-bier-push.service`** (first boot with a filled file needs no manual enable).

3. Logs: **`journalctl -u letztes-bier-push.service -f`**.

**HTTP API** (from the same CT only, unless you change `PUSH_LISTEN`):

- **`GET /healthz`** → `200 ok` (no auth).
- **`POST /v1/push`** → body JSON:

  ```json
  {
    "endpoint": "https://fcm.googleapis.com/… or mozilla endpoint",
    "keys": { "p256dh": "…", "auth": "…" },
    "payload": "{\"title\":\"Hi\"}"
  }
  ```

  Header **`Authorization: Bearer <PUSH_INTERNAL_TOKEN>`** or **`X-Internal-Token: <PUSH_INTERNAL_TOKEN>`**.

Because it listens on **loopback**, the WAN firewall does not need an extra port; PocketBase **`pb_hooks`** can **`$http.send`** to **`http://127.0.0.1:8787/v1/push`**. The SPA must still **subscribe** via the browser Push API and store subscription JSON—this relay only sends to an existing subscription.

**Local dev:** build the binary with **`go build -o letztes-bier-push ./cmd/push-api`** and run with the same env vars (not started by **`make run`**).

## Build a vztmpl tarball

On a Linux host with Podman or Docker:

```bash
make build
make proxmox-ct
```

To embed the LXC autocert hostname in **`/etc/default/letztes-bier`** at **image build** time (so you do not rely on the checked-in `packaging/letztes-bier.default`), pass **`PB_DOMAIN`** (Make variable or environment):

```bash
make proxmox-ct PB_DOMAIN=beer.example.com
# or: export PB_DOMAIN=beer.example.com && make proxmox-ct
```

If **`PB_DOMAIN`** is unset or empty, the file in the image is exactly **`packaging/letztes-bier.default`**.

This writes `dist/<TEMPLATE_BASENAME>_<timestamp>_<arch>.tar.gz` (for example `letztes-bier_ct-template_20260507_120000_amd64.tar.gz`).

Override names if needed:

```bash
make proxmox-ct IMAGE_TAG=myregistry/letztes-bier:v1 TEMPLATE_BASENAME=myapp_ct-template
```

## Import into Proxmox

1. Copy the `.tar.gz` to your Proxmox node (or upload via the UI).
2. Put it on a storage pool with content type **Container template** (`vztmpl`).
3. Create an **LXC** CT from that template.

## Persistence

Bind-mount or attach a Proxmox volume for **`/pb/pb_data`** (SQLite database and uploads). Recreating the CT without a persistent mount loses data.

## DNS and firewall

| Requirement | Detail |
|-------------|--------|
| **DNS** | `A` (and `AAAA` if you use IPv6) for your public hostname → the IP that reaches the CT (or the node that DNATs to it). |
| **Firewall** | Allow inbound **TCP 80** and **443** on the path to the CT (datacenter / host / CT NIC firewall). **80** must be reachable from the internet for Let’s Encrypt HTTP-01 during issuance and renewal. |

## Runtime environment (OCI / Podman)

Set **`PB_DOMAIN`** to the public FQDN (single hostname for v1), for example:

```text
PB_DOMAIN=beer.example.com
```

On an **LXC** CT, set the same variable in persistent **`/etc/default/letztes-bier`** (see above).

Rebuild the SPA with **`PUBLIC_POCKETBASE_URL=https://beer.example.com`** (or your real URL) if the app is configured with a fixed API origin at build time.

Publish host ports:

```bash
-p 80:80 -p 443:443
```

Example Podman/Docker run (after building the image on the node or pulling it):

```bash
podman run --name letztes-bier -d \
  --restart unless-stopped \
  -e PB_DOMAIN=beer.example.com \
  -p 80:80 -p 443:443 \
  -v /path/on/host/pb_data:/pb/pb_data \
  letztes-bier:local
```

## Low ports (80 / 443) in unprivileged LXC

If PocketBase cannot bind **80** or **443** inside the CT (common with **unprivileged** containers and privileged ports), options include:

- Use a **privileged** CT for this workload, or
- Adjust container/network capabilities or sysctls only after you understand the security tradeoffs (for example `net.ipv4.ip_unprivileged_port_start` scoped to the CT), or
- Terminate TLS on the **host** with a reverse proxy and keep PocketBase on high ports (then autocert inside the CT is not the right model; use HTTP on 8090 and a proxy that obtains certificates).

See [Proxmox Linux containers](https://pve.proxmox.com/wiki/Linux_Container) for CT options.

## Reverse proxy (optional)

If you already terminate HTTPS on the Proxmox host or another edge, you can run PocketBase **HTTP-only** on 8090 by overriding the entrypoint (same as `make run`) and let **Caddy**, **nginx**, or **Traefik** handle Let’s Encrypt. That path is optional and not the default for this image.
