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
