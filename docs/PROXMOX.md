# Proxmox: container template + PocketBase autocert

Production images use **PocketBase built-in Let’s Encrypt** (autocert): the container entrypoint runs `pocketbase serve <domain>` on **80** (HTTP + ACME HTTP-01) and **443** (HTTPS). See [Going to production](https://pocketbase.io/docs/going-to-production/).

Local development uses `make run`, which bypasses that entrypoint and serves plain HTTP on **8090** inside the container.

## Build a vztmpl tarball

On a Linux host with Podman or Docker:

```bash
make proxmox-ct-image   # same as make build
make proxmox-ct
```

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

## Runtime environment

Set **`PB_DOMAIN`** to the public FQDN (single hostname for v1), for example:

```text
PB_DOMAIN=beer.example.com
```

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
