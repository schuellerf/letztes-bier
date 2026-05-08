# Letztes Bier (SvelteKit + PocketBase)

Single-container deployment: PocketBase serves the built SPA from `pb_public`, persists SQLite in `pb_data`, applies `pb_migrations` on start.

**Production TLS:** the default container entrypoint uses PocketBase **autocert** (Let’s Encrypt on **80** / **443**) via `PB_DOMAIN`. See [docs/PROXMOX.md](docs/PROXMOX.md) for Proxmox, DNS, and firewall. **`make run`** overrides the entrypoint and keeps plain HTTP on **8090** for local dev.

## Quick start (Podman)

```bash
make run
```

This creates **`./pb_data`**, builds the image (`letztes-bier:local`), and runs it with that directory mounted at `/pb/pb_data`.

Use **`make ENGINE=docker run`** if you use Docker instead of Podman (volume **`:Z`** is omitted for Docker). Override **`IMAGE_TAG`** if you tag the image differently than **`IMAGE`** (default **`letztes-bier:local`**).

Open `http://localhost:8888/` by default (`PORT=8090` if you prefer **8090** on the host). Admin UI: `http://localhost:8888/_/` (same port).

Other targets: **`make build`**, **`make clean`** (removes `web/build`, `web/.svelte-kit`, and the local image—**not** `pb_data/`), **`make proxmox-ct`** (gzip rootfs tarball for Proxmox `vztmpl` into `dist/`; see [docs/PROXMOX.md](docs/PROXMOX.md)).

To exercise **autocert** locally, run the image without overriding the entrypoint, set `-e PB_DOMAIN=your.hostname`, and publish **80** and **443** (DNS for that hostname must point at your machine).

First boot: create a **superuser** in the PocketBase logs / prompt (or use `pocketbase superuser` if running the binary locally).

### Create staff `users` (Auth collection)

In the Admin UI, create `users` records with:

| Email   | Role    | Bar relation                         | Storage relation |
|---------|---------|--------------------------------------|------------------|
| admin   | `admin` | (empty)                              | (empty)          |
| storage | `storage` | (empty)                            | **must** point at a `storages` record |
| bar staff | `bar` | **must** point at a `bars` record | (empty)          |

Create **`bars`** records first (e.g. “Main Bar”, “VIP”), then bar accounts with `role = bar` and `bar` set to that record.

Create **`storages`** records for each hub (e.g. “Main”, “Annex”). Set **`hub_order`** so the **lowest** number is the default hub (custom items on the bar go there). Seed migration creates **Main** at **`hub_order = 1`** (values start at 1). Each **`storage`** user must have **`storage`** set to their hub’s record.

### Join links

- Bar devices: `https://your-host/join?bar=<bars_record_id>` (opaque id from Admin).
- Storage devices: `https://your-host/join?storage=<storages_record_id>` — same idea as bar join (checks account matches link after sign-in).
- You can still open `/storage` directly and sign in; join links reduce wrong-hub logins when you run multiple storage hubs.

## Local development

Terminal 1 — PocketBase with migrations:

```bash
mkdir -p pb_data
./pocketbase serve --dir=./pb_data --publicDir=./web/build --migrationsDir=./pb_migrations
```

(Install [PocketBase](https://pocketbase.io/docs/) v0.37+ locally, or use the container image via `make run`.)

After the SPA is built once (`cd web && npm run build`), you can point `--publicDir` at `web/build`.

The main schema lives in a **squashed** migration under `pb_migrations/`; **incremental** migrations (for example Web Push **`push_subscriptions`**) apply afterward on a fresh or existing database when you **`serve`** with that directory. If you ever had an incompatible migration history in `./pb_data`, delete that directory (or reset the DB) so PocketBase can apply migrations from scratch.

If a migration **failed** after being recorded, or you **edited** an already-applied migration file, run PocketBase **`migrate down`** (then fix data if needed) or **`migrate history-sync`** so the revised file can apply; see [Migrations](https://pocketbase.io/docs/js-migrations/).

Terminal 2 — Vite dev server (proxies `/api` to PocketBase):

```bash
cd web && npm install && npm run dev
```

Open the URL Vite prints; API calls go to PocketBase on `8090` via proxy.

### Web Push (optional)

Browsers need the **VAPID public** key at **build** or **dev** time. Set **`PUBLIC_VAPID_PUBLIC_KEY`** in the environment (see **`web/.env.example`**); it must match **`VAPID_PUBLIC_KEY`** on **`letztes-bier-push`**. Image builds: **`make build PUBLIC_VAPID_PUBLIC_KEY='...'`**. PocketBase **`pb_hooks`** use **`PUSH_INTERNAL_TOKEN`** from **`/etc/default/letztes-bier`**, matching the push service — see [docs/PROXMOX.md](docs/PROXMOX.md) for the full checklist.

## Public vs LAN

See [docs/RULES.md](docs/RULES.md). Default collection rules require authenticated users with `role` + `bar` for bar accounts.

### Live dashboard lists (realtime)

Bar and storage UIs refresh when PocketBase emits **realtime** events on the `requests` collection. If lists only update after a manual reload:

1. **Staff assignments:** In Admin, each **bar** user must have **`bar`** set; each **storage** user must have **`storage`** set to the correct **storages** hub (see the staff users table in this README).
2. **Migration history:** After the squashed schema in `pb_migrations/`, a broken history in `pb_data` can cause odd behavior—use **`migrate history-sync`** / **`migrate down`** as in the paragraph below if you edited migrations or saw failed applies.
3. **PocketBase version:** Use a current binary (see local dev section; filtered realtime behavior can differ by version). Note the version you run when reporting issues.
4. **`pb_hooks` + push:** **`pb_hooks/push_notify_requests.pb.js`** must use **`onCollectionAfter*`** hooks on **`requests`**, not **`onRecordAfter*`**, or PocketBase **0.37.x** can drop **`requests/*` realtime** for connected clients ([`docs/requests-realtime-investigation.md`](docs/requests-realtime-investigation.md)). The **`push_subscriptions`** collection itself does **not** change **`requests`** list rules—only migrations do.

## Infrastructure (OpenTofu)

Examples (adjust variables, state backend, and secrets):

- [infra/aws/](infra/aws/) — `t3.micro`-style EC2 + cloud-init Docker run.
- [infra/proxmox/](infra/proxmox/) — placeholder module; add `proxmox_virtual_environment_vm` per your [bpg/proxmox](https://registry.terraform.io/providers/bpg/proxmox/latest/docs) version.

Neither path publishes a container registry by default; build and push `letztes-bier:latest` (e.g. `podman build -f Containerfile -t letztes-bier:latest .`), or copy this repo to the VM and build there. For a **Proxmox CT template tarball**, use **`make proxmox-ct`** ([docs/PROXMOX.md](docs/PROXMOX.md)).

## Project layout

| Path | Purpose |
|------|---------|
| `web/` | SvelteKit 5 + Tailwind, `@sveltejs/adapter-static` |
| `pb_migrations/` | PocketBase JS migrations (`bars`, `storages`, `users`, `requests`, hooks) |
| `Containerfile` | Build SPA → `pb_public`, PocketBase, Debian+systemd vztmpl, optional **`letztes-bier-push`** binary |
| `cmd/push-api/` | Go Web Push relay (systemd unit **`letztes-bier-push`**, see [docs/PROXMOX.md](docs/PROXMOX.md)) |
| `go.mod` / `go.sum` | Build dependency for **`letztes-bier-push`** |
| `Makefile` | `make build` / `make run` / `make clean` / `make proxmox-ct` (Podman default) |
| `docs/PROXMOX.md` | Proxmox vztmpl import, `PB_DOMAIN`, firewall, persistence |
