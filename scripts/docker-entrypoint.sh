#!/bin/sh
set -eu

if [ -z "${PB_DOMAIN:-}" ]; then
	echo "docker-entrypoint: PB_DOMAIN is required for autocert (use --entrypoint /pb/pocketbase for HTTP-only, e.g. make run)" >&2
	exit 1
fi

exec /pb/pocketbase serve "$PB_DOMAIN" \
	--dir=/pb/pb_data \
	--publicDir=/pb/pb_public \
	--migrationsDir=/pb/pb_migrations \
	--hooksDir=/pb/pb_hooks
