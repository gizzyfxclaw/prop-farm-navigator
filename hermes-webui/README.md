# Hermes WebUI — GizzyFx Professional Trading Co-Pilot

This directory contains the GizzyFx Professional Trading Co-Pilot theme for Hermes WebUI.

## What's Included

| File | Purpose |
|:-----|:--------|
| `hermes-webui/gizzyfx.js` | Skin registration + default enforcement |
| `webui-assets/gizzyfx-pro.css` | Professional trading co-pilot stylesheet (27KB) |
| `webui-assets/gizzyfx-pro.js` | Minified deployment copy of the JS |
| `webui-assets/index.html` | Modified Hermes WebUI entry point |

## How to Deploy on Your VPS

1. **Copy the files to your Hermes WebUI installation:**

```bash
# From your prop-farm-navigator repo root:
cp hermes-webui/gizzyfx.js /opt/hermes-webui/hermes/webui-extension/
cp webui-assets/gizzyfx-pro.css /opt/hermes-webui/hermes/webui-extension/
cp webui-assets/gizzyfx-pro.js /opt/hermes-webui/static/vendor/
cp webui-assets/gizzyfx-pro.css /opt/hermes-webui/static/vendor/

# Add the CSS link and JS script to /opt/hermes-webui/static/index.html
# (see webui-assets/index.html for reference)
```

2. **Restart Hermes WebUI:**

```bash
systemctl --user restart hermes-webui.service
```

3. **The GizzyFx Pro skin is applied automatically** — it's the default for all users.

## Selecting Skins

Users can switch skins via **Settings → Appearance → Skin**:

1. **GizzyFx Pro** ← default, professional trading co-pilot
2. GizzyFx Cyan — electric cyan/teal
3. GizzyFx Blue — dark navy blue
4. GizzyFx Purple — original purple

## Design Philosophy

- **Sharp, matte surfaces** — no glassmorphism
- **Institutional blue accent** — Bloomberg-style
- **Inter + JetBrains Mono** — professional typography
- **Dense information layout** — more content per screen
- **Purposeful motion** — reduced animations

## Verification

After deployment, hard refresh (`Ctrl+Shift+R`) and you'll see:
- Dark matte black/navy interface
- Monospace data displays
- Professional color coding (green=bull, red=bear, amber=warning)
- Slim institutional scrollbars
