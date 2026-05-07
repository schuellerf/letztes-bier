# PocketBase API rules (public vs LAN)

**Letztes Bier** ships **default rules in `pb_migrations`** aimed at a **multi-role authenticated** setup:

| Collection | List / view | Create | Update | Notes |
|------------|-------------|--------|--------|------|
| `bars` | `admin`, `storage`, `bar` | `admin` | `admin` | Create bars and staff accounts in the Admin UI (or API as admin). |
| `requests` | Storage sees all; bar sees **only** `bar = @request.auth.bar` | Bar only; `status` must be `pending`; `bar` must match user | `storage` or `admin` | Bar users cannot patch after create (Fulfillment uses Accept / Done). |

## Public deployment

- Prefer **HTTPS**, **strong passwords**, and **Google OAuth** for human admins (configure OAuth in PocketBase Admin → Settings).
- Treat **join / storage URLs as secrets**; use unguessable bar record IDs and rotate if leaked.
- **Do not** widen rules to anonymous `create` on `requests` on the open internet.

## LAN / trusted-VLAN “simplified” mode (optional)

For a closed staff network you *may* relax rules (e.g. broader `listRule` on `bars`) **only** after accepting spoofing / noise risk. If you relax rules, segment the Wi‑Fi (staff VLAN), firewall PocketBase from guest networks, and snapshot `pb_data` backups.

See the root `README.md` for operations.
