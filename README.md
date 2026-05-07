# Letztes Bier (SvelteKit + PocketBase)

Single-container deployment: PocketBase serves the built SPA from `pb_public`, persists SQLite in `pb_data`, applies `pb_migrations` on start.

## Quick start (Podman)

```bash
make run
```

This creates **`./pb_data`**, builds the image (`letztes-bier:local`), and runs it with that directory mounted at `/pb/pb_data`.

Use **`make ENGINE=docker run`** if you use Docker instead of Podman (volume **`:Z`** is omitted for Docker).

Open `http://localhost:8090/`. Admin UI (for superuser & collection management): `http://localhost:8090/_/`.

Other targets: **`make build`**, **`make clean`** (removes `web/build`, `web/.svelte-kit`, and the local image—**not** `pb_data/`).

First boot: create a **superuser** in the PocketBase logs / prompt (or use `pocketbase superuser` if running the binary locally).

### Create staff `users` (Auth collection)

In the Admin UI, create `users` records with:

| Email   | Role    | Bar relation                         | Storage relation |
|---------|---------|--------------------------------------|------------------|
| admin   | `admin` | (empty)                              | (empty)          |
| storage | `storage` | (empty)                            | **must** point at a `storages` record |
| bar staff | `bar` | **must** point at a `bars` record | (empty)          |

Create **`bars`** records first (e.g. “Main Bar”, “VIP”), then bar accounts with `role = bar` and `bar` set to that record.

Create **`storages`** records for each hub (e.g. “Main”, “Annex”). Set **`hub_order`** so the **lowest** number is the default hub (custom items on the bar go there). Seed migration creates **Main** at `hub_order = 0`. Each **`storage`** user must have **`storage`** set to their hub’s record.

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

Schema is applied from a **single** squashed file in `pb_migrations/`. If you ever had an older multi-step migration history in `./pb_data`, delete that directory (or reset the DB) so PocketBase runs the initial migration on a clean database.

Terminal 2 — Vite dev server (proxies `/api` to PocketBase):

```bash
cd web && npm install && npm run dev
```

Open the URL Vite prints; API calls go to PocketBase on `8090` via proxy.

## Public vs LAN

See [docs/RULES.md](docs/RULES.md). Default collection rules require authenticated users with `role` + `bar` for bar accounts.

## Infrastructure (OpenTofu)

Examples (adjust variables, state backend, and secrets):

- [infra/aws/](infra/aws/) — `t3.micro`-style EC2 + cloud-init Docker run.
- [infra/proxmox/](infra/proxmox/) — placeholder module; add `proxmox_virtual_environment_vm` per your [bpg/proxmox](https://registry.terraform.io/providers/bpg/proxmox/latest/docs) version.

Neither path publishes a container registry by default; build and push `letztes-bier:latest` (e.g. `podman build -f Containerfile -t letztes-bier:latest .`), or copy this repo to the VM and build there.

## Project layout

| Path | Purpose |
|------|---------|
| `web/` | SvelteKit 5 + Tailwind, `@sveltejs/adapter-static` |
| `pb_migrations/` | PocketBase JS migrations (`bars`, `storages`, `users`, `requests`, hooks) |
| `Containerfile` | Build SPA → `pb_public`, bundle PocketBase binary |
| `Makefile` | `make build` / `make run` / `make clean` (Podman default) |
