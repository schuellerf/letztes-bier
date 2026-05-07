# OpenTofu / Terraform examples

Build the application image from the **repository root** with **`make build`** (Podman) or `podman build -f Containerfile -t stock-request:latest .` before applying these stacks or pushing to a registry.

These snippets are intentionally minimal. Tune security groups, disk size, cloud-init (add SSH keys, non-root users), and image registry paths before production.

## AWS (`infra/aws/`)

```bash
cd infra/aws
tofu init
tofu apply -var='docker_image=stock-request:latest'
```

Ensure the AMI can pull your image (push to a registry the instance can reach, or bake via `docker save` / private mirror).

## Proxmox (`infra/proxmox/`)

The checked-in `main.tf` is a placeholder. Add a `required_providers` block for
[`bpg/proxmox`](https://registry.terraform.io/providers/bpg/proxmox/latest/docs) and define
`proxmox_virtual_environment_vm` (and related file/snippet resources) according to **your** Proxmox
version. Mirror the AWS user-data: install Docker, then `docker run` your `stock-request` image with
a volume for `/pb/pb_data`.
