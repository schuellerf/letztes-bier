# syntax=docker/dockerfile:1

FROM node:22-alpine AS web
WORKDIR /src
ARG PUBLIC_VAPID_PUBLIC_KEY=
ENV PUBLIC_VAPID_PUBLIC_KEY=$PUBLIC_VAPID_PUBLIC_KEY
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.22-bookworm AS push-api
WORKDIR /src
COPY go.mod go.sum ./
COPY cmd/push-api ./cmd/push-api
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /letztes-bier-push ./cmd/push-api

# Appliance rootfs for Proxmox vztmpl: Debian + systemd + DHCP on eth0 (ifupdown + dhclient).
FROM debian:bookworm
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
	dbus \
	ifupdown \
	iproute2 \
	isc-dhcp-client \
	libpam-systemd \
	systemd \
	systemd-sysv \
	unzip \
	&& rm -rf /var/lib/apt/lists/*

RUN dbus-uuidgen --ensure=/etc/machine-id \
	&& ln -sf /etc/machine-id /var/lib/dbus/machine-id \
	&& ln -sf /dev/null /etc/systemd/system/systemd-networkd.service \
	&& ln -sf /dev/null /etc/systemd/system/systemd-networkd.socket \
	&& ln -sf /dev/null /etc/systemd/system/systemd-resolved.service

COPY packaging/network.interfaces /etc/network/interfaces
COPY packaging/letztes-bier.service /etc/systemd/system/letztes-bier.service
COPY packaging/letztes-bier.default /etc/default/letztes-bier
COPY packaging/letztes-bier-push.service /etc/systemd/system/letztes-bier-push.service
COPY packaging/letztes-bier-push.default /etc/default/letztes-bier-push
COPY --from=push-api /letztes-bier-push /usr/local/bin/letztes-bier-push
RUN chmod +x /usr/local/bin/letztes-bier-push
# Optional at build: `make build PB_DOMAIN=host.example.com` (or export PB_DOMAIN) bakes LXC autocert hostname into /etc/default/letztes-bier.
ARG PB_DOMAIN=
RUN if [ -n "$PB_DOMAIN" ]; then \
	printf '%s\n' \
		'# /etc/default/letztes-bier — set at image build (see Makefile PB_DOMAIN).' \
		"# Edit on the CT after deploy if needed." \
		"PB_DOMAIN=$PB_DOMAIN" \
		> /etc/default/letztes-bier; \
	fi

RUN PB_VER=0.37.5 \
	&& curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VER}/pocketbase_${PB_VER}_linux_amd64.zip" -o /tmp/pb.zip \
	&& mkdir -p /pb \
	&& unzip /tmp/pb.zip -d /pb \
	&& rm /tmp/pb.zip \
	&& chmod +x /pb/pocketbase

WORKDIR /pb
COPY scripts/docker-entrypoint.sh /pb/docker-entrypoint.sh
RUN chmod +x /pb/docker-entrypoint.sh
COPY --from=web /src/build ./pb_public
COPY pb_migrations ./pb_migrations
COPY pb_hooks ./pb_hooks

RUN ln -sf /lib/systemd/system/networking.service \
	/etc/systemd/system/multi-user.target.wants/networking.service \
	&& ln -sf /etc/systemd/system/letztes-bier.service \
	/etc/systemd/system/multi-user.target.wants/letztes-bier.service \
	&& ln -sf /etc/systemd/system/letztes-bier-push.service \
	/etc/systemd/system/multi-user.target.wants/letztes-bier-push.service

ENV PB_DATA_DIR=/pb/pb_data
VOLUME ["/pb/pb_data"]
EXPOSE 80 443
STOPSIGNAL SIGRTMIN+3

ENTRYPOINT ["/pb/docker-entrypoint.sh"]
