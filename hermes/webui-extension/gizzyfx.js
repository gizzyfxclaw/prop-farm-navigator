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
      colors: ["#0a0713", "#a78bfa", "#f472b6"],
      tokens: {
        "--bg": "#0a0713",
        "--surface": "#141020",
        "--surface2": "#1b1529",
        "--surface-subtle": "#100c1b",
        "--sidebar": "#0c0916",
        "--sidebar-text": "#9b8fb8",

        "--text": "#ebe7f5",
        "--text2": "#b4a8cd",
        "--muted": "#7d719a",

        "--accent": "#a78bfa",
        "--accent-hover": "#8b5cf6",
        "--accent-contrast": "#0a0713",
        "--accent-text": "#c4b5fd",
        "--accent-bg": "rgba(167, 139, 250, 0.10)",
        "--accent-bg-strong": "rgba(167, 139, 250, 0.20)",
        "--accent-rgb": "167, 139, 250",
        "--accent2": "#c4b5fd",
        "--accent3": "#f472b6",

        "--border": "rgba(167, 139, 250, 0.16)",
        "--border2": "rgba(167, 139, 250, 0.28)",
        "--hover-bg": "rgba(167, 139, 250, 0.07)",

        "--code-bg": "#0c0916",
        "--code-text": "#d6cbf0",

        "--user-bubble": "#1d1730",
        "--assistant-bubble": "#131024",

        "--success": "#34d399",
        "--warning": "#ffc247",
        "--danger": "#ff5f56",
        "--info": "#c4b5fd",
        "--link": "#c4b5fd",
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
    '<circle cx="50" cy="50" r="45" stroke="#a78bfa" stroke-width="6" fill="none"/>' +
    '<rect x="24" y="46" width="9" height="22" rx="1.5" fill="#17c95c"/>' +
    '<rect x="38" y="34" width="9" height="30" rx="1.5" fill="#e8433f"/>' +
    '<rect x="52" y="40" width="9" height="24" rx="1.5" fill="#17c95c"/>' +
    '<path d="M22 76 C 42 76, 60 66, 72 42" stroke="#f472b6" stroke-width="8" ' +
    'stroke-linecap="round" fill="none"/>' +
    '<path d="M62 30 L82 36 L72 53 Z" fill="#f472b6"/>' +
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
