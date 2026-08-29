# GizzyFx skin for Hermes WebUI

Brings the Hermes console in line with the GizzyFx terminal: the same neon-green
palette, the brand watermark behind the app, and a persistent link back to the
Engine.

Built on the WebUI's own extension surface (`docs/EXTENSIONS.md` upstream), so
nothing in the hermes-webui source tree is modified and updates won't clobber it.

## What it adds

| | |
|---|---|
| **GizzyFx skin** | Registered through `window.registerHermesSkin()`, so it appears in **Settings → Appearance** next to the built-in skins and persists like any other. Dark-only. Applied automatically on first visit — see below. |
| **Brand watermark** | The GizzyFx badge, faded behind the app shell, on a very slow breathing cycle. |
| **Navigation bar** | Bottom-right: **Engine** and **Trading Agent** links back to the terminal. Collapses to an icon on narrow screens. |

All chrome is scoped to `:root[data-skin="gizzyfx"]` — switching to another skin
restores the stock appearance exactly.

## Install

On the VPS, from a checkout of this repo:

```bash
cd hermes/webui-extension
bash install.sh
```

Then hard-reload the console (Ctrl/Cmd + Shift + R). The skin applies itself
on first visit; no need to pick it manually.

### Default-skin behaviour

The extension seeds `localStorage["hermes-skin"]` once per browser, and only
while the console is still on the stock appearance. Pick any other skin
afterwards and the extension never overrides it again — the picker always wins.
To go back, choose **GizzyFx** in Settings → Appearance like any other skin.

The script copies the two assets to `~/.hermes/webui-extension/`, sets the three
`HERMES_WEBUI_EXTENSION_*` variables in `/opt/hermes-webui/.env` (backing the
file up first, and replacing rather than duplicating any existing values), and
restarts the user-level `hermes-webui` service.

If your `.env` lives elsewhere:

```bash
HERMES_WEBUI_ENV=/path/to/.env bash install.sh
```

### Manual install

```bash
mkdir -p ~/.hermes/webui-extension
cp gizzyfx.css gizzyfx.js ~/.hermes/webui-extension/

cat >> /opt/hermes-webui/.env <<'EOF'
HERMES_WEBUI_EXTENSION_DIR=/home/ubuntu/.hermes/webui-extension
HERMES_WEBUI_EXTENSION_STYLESHEET_URLS=/extensions/gizzyfx.css
HERMES_WEBUI_EXTENSION_SCRIPT_URLS=/extensions/gizzyfx.js
EOF

systemctl --user restart hermes-webui
```

`HERMES_WEBUI_EXTENSION_DIR` must be an absolute path to an existing directory —
WebUI never creates it for you, and refuses to inject the assets if it is missing.

## Uninstall

```bash
sed -i '/^HERMES_WEBUI_EXTENSION_/d' /opt/hermes-webui/.env
systemctl --user restart hermes-webui
```

## Files

- `gizzyfx.js` — registers the skin, builds the navigation bar
- `gizzyfx.css` — watermark, glass surfaces, navigation styling
- `install.sh` — copies assets, edits `.env`, restarts the service

## A note on trust

WebUI extensions run with full session authority — an extension script can call
any API the logged-in user can. That is why this one lives in your own repo
rather than being pulled from a third party: read both files before installing,
they are short and have no dependencies.
