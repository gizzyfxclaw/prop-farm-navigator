/**
 * GizzyFx skin + navigation for Hermes WebUI — electric cyan/teal theme.
 *
 * Registers a "GizzyFx" skin in Settings → Appearance and adds a persistent
 * link back to the GizzyFx Engine.
 *
 * Install: see hermes/webui-extension/README.md
 */
(function () {
  "use strict";

  var ENGINE_URL = "https://gizzyfxstrategy.dpdns.org";
  var AGENT_URL = ENGINE_URL + "/hermes";

  /* ── 1. Make GizzyFx the default skin, once ───────────────────────
   * Seeded exactly once per browser, and only while the console is still on
   * the stock appearance. After that the picker always wins.
   */
  var SEED_KEY = "gizzyfx-skin-seeded";

  function seedDefaultSkin() {
    try {
      if (localStorage.getItem(SEED_KEY)) return;
      localStorage.setItem(SEED_KEY, "1");
      var current = localStorage.getItem("hermes-skin");
      if (!current || current === "default") {
        localStorage.setItem("hermes-skin", "gizzyfx");
        document.documentElement.dataset.skin = "gizzyfx";
      }
    } catch (e) {
      // Private mode / storage disabled — the skin is still selectable by hand.
    }
  }

  seedDefaultSkin();

  /* ── 2. Register the GizzyFx skin ─────────────────────────────────
   * Electric cyan/teal palette matching the GizzyFx Engine.
   */
  function registerSkin() {
    if (typeof window.registerHermesSkin !== "function") return false;

    return window.registerHermesSkin({
      name: "GizzyFx",
      value: "gizzyfx",
      label: "GizzyFx",
      scheme: "dark",
      colors: ["#061520", "#00c8e8", "#00e5c8"],
      tokens: {
        "--bg": "#061520",
        "--surface": "#0a1e2e",
        "--surface2": "#0f2438",
        "--surface-subtle": "#081929",
        "--sidebar": "#061220",
        "--sidebar-text": "#5a8a9f",

        "--text": "#e8f4f8",
        "--text2": "#8ab8cc",
        "--muted": "#4a7a90",

        "--accent": "#00c8e8",
        "--accent-hover": "#00b5d4",
        "--accent-contrast": "#061520",
        "--accent-text": "#5ae0f0",
        "--accent-bg": "rgba(0, 200, 232, 0.10)",
        "--accent-bg-strong": "rgba(0, 200, 232, 0.20)",
        "--accent-rgb": "0, 200, 232",
        "--accent2": "#00e5c8",
        "--accent3": "#5ae0f0",

        "--border": "rgba(0, 200, 232, 0.16)",
        "--border2": "rgba(0, 200, 232, 0.28)",
        "--hover-bg": "rgba(0, 200, 232, 0.07)",

        "--code-bg": "#061220",
        "--code-text": "#a0d8e8",

        "--user-bubble": "#0d2435",
        "--assistant-bubble": "#091d2c",

        "--success": "#34d399",
        "--warning": "#ffc247",
        "--danger": "#ff5f56",
        "--info": "#5ae0f0",
        "--link": "#5ae0f0",
      },
    });
  }

  if (!registerSkin()) {
    var tries = 0;
    var poll = setInterval(function () {
      if (registerSkin() || ++tries > 40) clearInterval(poll);
    }, 150);
  }

  /* ── 3. Persistent "back to Engine" navigation ──────────────────── */

  var MARK_SVG =
    '<svg viewBox="0 0 100 100" width="18" height="18" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="47" fill="#040e14"/>' +
    '<circle cx="50" cy="50" r="45" stroke="#00c8e8" stroke-width="6" fill="none"/>' +
    '<rect x="24" y="46" width="9" height="22" rx="1.5" fill="#17c95c"/>' +
    '<rect x="38" y="34" width="9" height="30" rx="1.5" fill="#e8433f"/>' +
    '<rect x="52" y="40" width="9" height="24" rx="1.5" fill="#17c95c"/>' +
    '<path d="M22 76 C 42 76, 60 66, 72 42" stroke="#00e5c8" stroke-width="8" ' +
    'stroke-linecap="round" fill="none"/>' +
    '<path d="M62 30 L82 36 L72 53 Z" fill="#00e5c8"/>' +
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
