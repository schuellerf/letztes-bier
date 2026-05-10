# Container image + local run (Podman by default; override ENGINE=docker if needed).
ENGINE ?= podman
IMAGE ?= letztes-bier:local
IMAGE_TAG ?= $(IMAGE)
PORT ?= 8888
CONTAINERFILE ?= Containerfile
CONTAINER_RUNTIME ?= $(ENGINE)
DIST_DIR ?= $(CURDIR)/dist
TEMPLATE_BASENAME ?= letztes-bier_ct-template
# Optional: bake Proxmox LXC autocert hostname into /etc/default/letztes-bier at image build, e.g. `make proxmox-ct PB_DOMAIN=host.example.com`
PB_DOMAIN ?=
# Optional: embed the Web Push VAPID *public* key in the SPA at image build (must match VAPID_PUBLIC_KEY on letztes-bier-push).
PUBLIC_VAPID_PUBLIC_KEY ?=
# Optional: fixed API origin in the SPA (omit when PocketBase is same-origin, see web/.env.example).
PUBLIC_POCKETBASE_URL ?=
# Output for `make app-bundle` — gzip tarball of web/build contents for copying to `/pb/pb_public` on a CT.
APP_BUNDLE_TGZ ?= $(DIST_DIR)/lb-web-pb_public.tgz

ifeq ($(ENGINE),podman)
VOL_LABEL := :Z
else
VOL_LABEL :=
endif

.DEFAULT_GOAL := help

.PHONY: help pb_data build run clean proxmox-ct-image proxmox-ct clean-dist app-bundle

help:
	@echo "Targets:"
	@echo "  make build           - build $(IMAGE_TAG) from $(CONTAINERFILE)"
	@echo "  make run             - ensure pb_data/, build, then HTTP on port $(PORT) (dev entrypoint)"
	@echo "  make clean           - remove web/build, web/.svelte-kit; drop $(IMAGE_TAG) (keeps pb_data/)"
	@echo "  make app-bundle      - npm build in web/, pack -> $(APP_BUNDLE_TGZ) (Proxmox /pb/pb_public drop-in)"
	@echo "  make proxmox-ct      - gzip rootfs tarball for Proxmox vztmpl -> $(DIST_DIR)/"
	@echo "  make clean-dist      - remove $(DIST_DIR)/"
	@echo "Variables: ENGINE=$(ENGINE) IMAGE_TAG=$(IMAGE_TAG) PORT=$(PORT) PB_DOMAIN=(optional, image build) PUBLIC_VAPID_PUBLIC_KEY / PUBLIC_POCKETBASE_URL=(optional, SPA) APP_BUNDLE_TGZ=(optional, app-bundle output path)"

# Host dir for bind-mount — only required by `run`, not image `build`.
pb_data:
	@mkdir -p pb_data

build:
	$(ENGINE) build -f $(CONTAINERFILE) -t $(IMAGE_TAG) \
		--build-arg PB_DOMAIN="$(PB_DOMAIN)" \
		--build-arg PUBLIC_VAPID_PUBLIC_KEY="$(PUBLIC_VAPID_PUBLIC_KEY)" \
		.

run: build | pb_data
	$(ENGINE) run --rm --entrypoint /pb/pocketbase \
		-p $(PORT):8090 \
		-v $(CURDIR)/pb_data:/pb/pb_data$(VOL_LABEL) \
		$(IMAGE_TAG) serve --http=0.0.0.0:8090 \
			--dir=/pb/pb_data \
			--publicDir=/pb/pb_public \
			--migrationsDir=/pb/pb_migrations \
			--hooksDir=/pb/pb_hooks

clean:
	rm -rf web/build web/.svelte-kit
	-$(ENGINE) rmi $(IMAGE_TAG) 2>/dev/null || true

app-bundle:
	@mkdir -p "$(DIST_DIR)"
	cd web && npm ci && \
		PUBLIC_POCKETBASE_URL="$(PUBLIC_POCKETBASE_URL)" \
		PUBLIC_VAPID_PUBLIC_KEY="$(PUBLIC_VAPID_PUBLIC_KEY)" \
		npm run build
	tar czf "$(APP_BUNDLE_TGZ)" --numeric-owner --owner=0 --group=0 -C web/build .

proxmox-ct: build
	@STAMP=$$(date +%Y%m%d_%H%M%S); \
	ROOT="$(CURDIR)" CONTAINER_RUNTIME="$(CONTAINER_RUNTIME)" IMAGE_TAG="$(IMAGE_TAG)" \
		DIST_DIR="$(DIST_DIR)" TEMPLATE_BASENAME="$(TEMPLATE_BASENAME)" TEMPLATE_STAMP="$$STAMP" \
		sh "$(CURDIR)/scripts/export-proxmox-ct-rootfs.sh"

clean-dist:
	rm -rf $(DIST_DIR)
