# Falco Security for Apployd

This directory contains Falco runtime detection rules tailored for Apployd deployment containers.

## Files

- `rules.d/apployd_rules.yaml`: Custom Falco detections for:
  - scanner binary execution in runtime containers
  - scanner installation attempts via package managers
  - netcat sweep patterns (`nc -z`)
  - suspicious outbound connections to high-risk ports

## Install on Ubuntu Host

```bash
bash infra/scripts/install-falco.sh
```

Or as part of provisioning:

```bash
bash infra/scripts/provision-ubuntu.sh --with-falco
```

## Verify

```bash
sudo systemctl status falco --no-pager
sudo journalctl -u falco -f
```

## Operational Note

Falco is a detection layer. Keep deployment-engine egress enforcement enabled (`ENGINE_SECURITY_MODE=strict`) so suspicious traffic is both detected and actively blocked.
