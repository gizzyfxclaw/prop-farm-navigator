/**
 * GizzyFx skin + navigation for Hermes WebUI.
 *
 * Registers a "GizzyFx" skin in Settings → Appearance (matching the terminal's
 * neon-green identity) and adds a persistent link back to the GizzyFx Engine.
 *
 * Install: see hermes/webui-extension/README.md
 */
(function () {
  "use strict";

  var ENGINE_URL = "https://gizzyfxstrategy.dpdns.org";
  var AGENT_URL = ENGINE_URL + "/hermes";

  /* ── 1. Register the GizzyFx skin ─────────────────────────────────
   * Token names and value shapes are restricted by WebUI core; these all
   * sit inside the documented allowlist.
   */
  function registerSkin() {
    if (typeof window.registerHermesSkin !== "function") return false;

    return window.registerHermesSkin({
      name: "GizzyFx",
      value: "gizzyfx",
      label: "GizzyFx",
      scheme: "dark", // the palette is built for a dark base only
      colors: ["#0a0f0c", "#1bff7a", "#c8d2d8"],
      tokens: {
        "--bg": "#070b09",
        "--surface": "#0e1512",
        "--surface2": "#131c17",
        "--surface-subtle": "#0b1210",
        "--sidebar": "#080d0b",
        "--sidebar-text": "#8fa89a",

        "--text": "#e6f2ea",
        "--text2": "#a8c0b3",
        "--muted": "#6d8579",

        "--accent": "#1bff7a",
        "--accent-hover": "#12e065",
        "--accent-contrast": "#04120a",
        "--accent-text": "#5cff9d",
        "--accent-bg": "rgba(27, 255, 122, 0.09)",
        "--accent-bg-strong": "rgba(27, 255, 122, 0.18)",
        "--accent-rgb": "27, 255, 122",
        "--accent2": "#5cff9d",
        "--accent3": "#0a8f3f",

        "--border": "rgba(27, 255, 122, 0.14)",
        "--border2": "rgba(27, 255, 122, 0.24)",
        "--hover-bg": "rgba(27, 255, 122, 0.06)",

        "--code-bg": "#080e0b",
        "--code-text": "#c9e8d6",

        "--user-bubble": "#132019",
        "--assistant-bubble": "#0d1411",

        "--success": "#1bff7a",
        "--warning": "#ffc247",
        "--danger": "#ff5f56",
        "--info": "#5cff9d",
        "--link": "#5cff9d",
      },
    });
  }

  // The skin registry may load after this script; retry briefly.
  if (!registerSkin()) {
    var tries = 0;
    var poll = setInterval(function () {
      if (registerSkin() || ++tries > 40) clearInterval(poll);
    }, 150);
  }

  /* ── 2. Persistent "back to Engine" navigation ──────────────────── */

  var MARK_SVG =
    '<svg viewBox="0 0 100 100" width="18" height="18" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="47" fill="#050807"/>' +
    '<circle cx="50" cy="50" r="45" stroke="#1bff7a" stroke-width="6" fill="none"/>' +
    '<rect x="24" y="46" width="9" height="22" rx="1.5" fill="#17c95c"/>' +
    '<rect x="38" y="34" width="9" height="30" rx="1.5" fill="#e8433f"/>' +
    '<rect x="52" y="40" width="9" height="24" rx="1.5" fill="#17c95c"/>' +
    '<path d="M22 76 C 42 76, 60 66, 72 42" stroke="#5cff9d" stroke-width="8" ' +
    'stroke-linecap="round" fill="none"/>' +
    '<path d="M62 30 L82 36 L72 53 Z" fill="#7dffb4"/>' +
    "</svg>";

  function buildNav() {
    if (document.getElementById("gizzyfx-nav")) return;

    var bar = document.createElement("div");
    bar.id = "gizzyfx-nav";
    bar.setAttribute("role", "navigation");
    bar.setAttribute("aria-label", "GizzyFx");

    var engine = document.createElement("a");
    engine.href = ENGINE_URL;
    engine.className = "gizzyfx-nav-link gizzyfx-nav-primary";
    engine.innerHTML = MARK_SVG + "<span>Engine</span>";
    engine.title = "Back to the GizzyFx Engine";

    var agent = document.createElement("a");
    agent.href = AGENT_URL;
    agent.className = "gizzyfx-nav-link";
    agent.textContent = "Trading Agent";
    agent.title = "Open the Trading Agent chart page";

    bar.appendChild(engine);
    bar.appendChild(agent);
    document.body.appendChild(bar);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildNav);
  } else {
    buildNav();
  }
})();
