# PocketBase API rules (public vs LAN)

**Letztes Bier** ships **default rules in `pb_migrations`** aimed at a **multi-role authenticated** setup:

| Collection | List / view | Create | Update | Notes |
|------------|-------------|--------|--------|------|
| `bars` | `admin`, `storage`, `bar` | `admin` | `admin` | Create bars and staff accounts in the Admin UI (or API as admin). |
| `storages` | `admin`, `storage`, `bar` | `admin` | `admin`, or **`storage`** only for the row `id = @request.auth.storage` | Hubs have `quick_items` (JSON). Bar users list all hubs to build the combined quick-add palette. `name` / `hub_order` are enforced server-side for non-admins via `pb_hooks`. |
| `requests` | **`admin`**: all; **`storage`**: `storage = @request.auth.storage`; **`bar`**: `bar = @request.auth.bar`** | Bar only; `status = pending`; `bar` and **`storage`** + `storage_name` set | `storage` or `admin` | Bar users cannot patch after create (fulfillment uses Accept / Done). Each request targets one hub (`storage`). |
| `push_subscriptions` | `owner = @request.auth.id` | Same | Same | One row per browser push endpoint (`endpoint` is unique). Relation **`owner`** points at `users` (field cannot be named `user` — reserved in PocketBase rules). Used by `pb_hooks` for Web Push; only the owning record can read or change their subscription. |

## Public deployment

- Prefer **HTTPS**, **strong passwords**, and **Google OAuth** for human admins (configure OAuth in PocketBase Admin → Settings).
- Treat **join / storage URLs as secrets**; use unguessable bar record IDs and rotate if leaked.
- **Do not** widen rules to anonymous `create` on `requests` on the open internet.

## LAN / trusted-VLAN “simplified” mode (optional)

For a closed staff network you *may* relax rules (e.g. broader `listRule` on `bars`) **only** after accepting spoofing / noise risk. If you relax rules, segment the Wi‑Fi (staff VLAN), firewall PocketBase from guest networks, and snapshot `pb_data` backups.

See the root `README.md` for operations.
