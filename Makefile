# Container image + local run (Podman by default; override ENGINE=docker if needed).
ENGINE ?= podman
IMAGE ?= stock-request:local
PORT ?= 8090
CONTAINERFILE ?= Containerfile

ifeq ($(ENGINE),podman)
VOL_LABEL := :Z
else
VOL_LABEL :=
endif

.DEFAULT_GOAL := help

.PHONY: help pb_data build run clean

help:
	@echo "Targets:"
	@echo "  make build   - build $(IMAGE) from $(CONTAINERFILE)"
	@echo "  make run     - ensure pb_data/, build, then run on port $(PORT)"
	@echo "  make clean   - remove web/build, web/.svelte-kit; drop $(IMAGE) (keeps pb_data/)"
	@echo "Variables: ENGINE=$(ENGINE) IMAGE=$(IMAGE) PORT=$(PORT)"

# Host dir for bind-mount — only required by `run`, not image `build`.
pb_data:
	@mkdir -p pb_data

build:
	$(ENGINE) build -f $(CONTAINERFILE) -t $(IMAGE) .

run: build | pb_data
	$(ENGINE) run --rm -p $(PORT):8090 \
		-v $(CURDIR)/pb_data:/pb/pb_data$(VOL_LABEL) \
		$(IMAGE)

clean:
	rm -rf web/build web/.svelte-kit
	-$(ENGINE) rmi $(IMAGE) 2>/dev/null || true
