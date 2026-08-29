# Vendored: Hermes Web UI

This directory is a snapshot of [nesquena/hermes-webui](https://github.com/nesquena/hermes-webui),
the control panel for the Hermes agent running on the VPS at
`hermes.gizzyfxstrategy.dpdns.org`. It's a separate Python app with its own
deploy lifecycle (a systemd service on the VPS, not part of the Cloudflare
Worker build) — it lives here for version control, not as something this
repo builds or deploys.

`hermes/gizzyfx_mcp.py` and `hermes/prefill.sh` are local additions (not
upstream) — the MCP bridge Hermes uses to talk to this trading terminal's
`/api/hermes/*` endpoints.

Snapshotted as a plain file copy (not a git subtree) to avoid pulling in
~200MB of upstream history into this repo. To pull in upstream fixes, copy
the updated files over manually rather than trying to `git merge` from
nesquena/hermes-webui directly.
