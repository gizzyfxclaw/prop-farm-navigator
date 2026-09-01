/**
 * GizzyFx skin + navigation for Hermes WebUI.
 *
 * Registers FOUR switchable skins in Settings → Appearance:
 *   • GizzyFx Pro    (value: "gizzyfx-pro")    — professional trading co-pilot
 *   • GizzyFx Cyan   (value: "gizzyfx")         — electric cyan/teal, default
 *   • GizzyFx Blue   (value: "gizzyfx-blue")     — dark navy blue
 *   • GizzyFx Purple (value: "gizzyfx-purple")   — original purple
 *
 * Adds a persistent nav bar with links back to the Engine and Trading Agent.
 *
 * Install: see hermes/webui-extension/README.md
 */
(function () {
  "use strict";

  var ENGINE_URL = "https://gizzyfxstrategy.dpdns.org";
  var AGENT_URL  = ENGINE_URL + "/hermes";

  /* ── 1. Force GizzyFx Pro as the default skin ───────────────────── */
  function forceDefaultSkin() {
    try {
      var current = localStorage.getItem("hermes-skin");
      if (!current || current === "default") {
        localStorage.setItem("hermes-skin", "gizzyfx-pro");
        document.documentElement.dataset.skin = "gizzyfx-pro";
      }
    } catch (e) {
      // Private mode / storage disabled — skin is still selectable by hand.
    }
  }

  forceDefaultSkin();

  /* ── 2. Register all four GizzyFx skins ─────────────────────────── */

  var SKINS = [
    /* ── Professional Trading Co-Pilot ─────────────────────────────── */
    {
      name: "GizzyFx Pro",
      value: "gizzyfx-pro",
      label: "GizzyFx Pro",
      scheme: "dark",
      colors: ["#0a0a0a", "#3b82f6", "#60a5fa"],
      tokens: {
        "--bg":                 "#0a0a0a",
        "--surface":            "#111111",
        "--surface2":           "#161616",
        "--surface-subtle":     "#1c1c1c",
        "--sidebar":            "#111111",
        "--sidebar-text":       "#777777",
        "--text":               "#e0e0e0",
        "--text2":              "#aaaaaa",
        "--muted":              "#777777",
        "--accent":             "#3b82f6",
        "--accent-hover":       "#60a5fa",
        "--accent-contrast":    "#0a0a0a",
        "--accent-text":        "#93bbfd",
        "--accent-bg":          "rgba(59, 130, 246, 0.08)",
        "--accent-bg-strong":   "rgba(59, 130, 246, 0.15)",
        "--accent-rgb":         "59, 130, 246",
        "--accent2":            "#60a5fa",
        "--accent3":            "#93bbfd",
        "--border":             "#2a2a2a",
        "--border2":            "#333333",
        "--hover-bg":           "#1c1c1c",
        "--code-bg":            "#161616",
        "--code-text":          "#e0e0e0",
        "--user-bubble":        "#161616",
        "--assistant-bubble":   "#111111",
        "--success":            "#22c55e",
        "--warning":            "#f59e0b",
        "--danger":             "#ef4444",
        "--info":               "#06b6d4",
        "--link":               "#60a5fa",
      },
    },

    /* ── Electric Cyan / Teal ─────────────────────────────────────── */
    {
      name: "GizzyFx Cyan",
      value: "gizzyfx",
      label: "GizzyFx Cyan",
      scheme: "dark",
      colors: ["#061520", "#00c8e8", "#00e5c8"],
      tokens: {
        "--bg":                 "#061520",
        "--surface":            "#0a1e2e",
        "--surface2":           "#0f2438",
        "--surface-subtle":     "#081929",
        "--sidebar":            "#061220",
        "--sidebar-text":       "#5a8a9f",
        "--text":               "#e8f4f8",
        "--text2":              "#8ab8cc",
        "--muted":              "#4a7a90",
        "--accent":             "#00c8e8",
        "--accent-hover":       "#00b5d4",
        "--accent-contrast":    "#061520",
        "--accent-text":        "#5ae0f0",
        "--accent-bg":          "rgba(0, 200, 232, 0.10)",
        "--accent-bg-strong":   "rgba(0, 200, 232, 0.20)",
        "--accent-rgb":         "0, 200, 232",
        "--accent2":            "#00e5c8",
        "--accent3":            "#5ae0f0",
        "--border":             "rgba(0, 200, 232, 0.16)",
        "--border2":            "rgba(0, 200, 232, 0.28)",
        "--hover-bg":           "rgba(0, 200, 232, 0.07)",
        "--code-bg":            "#061220",
        "--code-text":          "#a0d8e8",
        "--user-bubble":        "#0d2435",
        "--assistant-bubble":   "#091d2c",
        "--success":            "#34d399",
        "--warning":            "#ffc247",
        "--danger":             "#ff5f56",
        "--info":               "#5ae0f0",
        "--link":               "#5ae0f0",
      },
    },

    /* ── Dark Blue ────────────────────────────────────────────────── */
    {
      name: "GizzyFx Blue",
      value: "gizzyfx-blue",
      label: "GizzyFx Blue",
      scheme: "dark",
      colors: ["#05080f", "#3b82f6", "#60a5fa"],
      tokens: {
        "--bg":                 "#05080f",
        "--surface":            "#090e1c",
        "--surface2":           "#0e1528",
        "--surface-subtle":     "#070b17",
        "--sidebar":            "#060a15",
        "--sidebar-text":       "#4a6494",
        "--text":               "#e4eaf8",
        "--text2":              "#7a9acc",
        "--muted":              "#4060a0",
        "--accent":             "#3b82f6",
        "--accent-hover":       "#2563eb",
        "--accent-contrast":    "#05080f",
        "--accent-text":        "#93c5fd",
        "--accent-bg":          "rgba(59, 130, 246, 0.10)",
        "--accent-bg-strong":   "rgba(59, 130, 246, 0.20)",
        "--accent-rgb":         "59, 130, 246",
        "--accent2":            "#60a5fa",
        "--accent3":            "#93c5fd",
        "--border":             "rgba(59, 130, 246, 0.16)",
        "--border2":            "rgba(59, 130, 246, 0.28)",
        "--hover-bg":           "rgba(59, 130, 246, 0.07)",
        "--code-bg":            "#060a15",
        "--code-text":          "#93c5fd",
        "--user-bubble":        "#0b1225",
        "--assistant-bubble":   "#080e1e",
        "--success":            "#34d399",
        "--warning":            "#ffc247",
        "--danger":             "#ff5f56",
        "--info":               "#93c5fd",
        "--link":               "#93c5fd",
      },
    },

    /* ── Original Purple ──────────────────────────────────────────── */
    {
      name: "GizzyFx Purple",
      value: "gizzyfx-purple",
      label: "GizzyFx Purple",
      scheme: "dark",
      colors: ["#0a0713", "#a78bfa", "#f472b6"],
      tokens: {
        "--bg":                 "#0a0713",
        "--surface":            "#141020",
        "--surface2":           "#1b1529",
        "--surface-subtle":     "#100c1b",
        "--sidebar":            "#0c0916",
        "--sidebar-text":       "#9b8fb8",
        "--text":               "#ebe7f5",
        "--text2":              "#b4a8cd",
        "--muted":              "#7d719a",
        "--accent":             "#a78bfa",
        "--accent-hover":       "#8b5cf6",
        "--accent-contrast":    "#0a0713",
        "--accent-text":        "#c4b5fd",
        "--accent-bg":          "rgba(167, 139, 250, 0.10)",
        "--accent-bg-strong":   "rgba(167, 139, 250, 0.20)",
        "--accent-rgb":         "167, 139, 250",
        "--accent2":            "#c4b5fd",
        "--accent3":            "#f472b6",
        "--border":             "rgba(167, 139, 250, 0.16)",
        "--border2":            "rgba(167, 139, 250, 0.28)",
        "--hover-bg":           "rgba(167, 139, 250, 0.07)",
        "--code-bg":            "#0c0916",
        "--code-text":          "#d6cbf0",
        "--user-bubble":        "#1d1730",
        "--assistant-bubble":   "#131024",
        "--success":            "#34d399",
        "--warning":            "#ffc247",
        "--danger":             "#ff5f56",
        "--info":               "#c4b5fd",
        "--link":               "#c4b5fd",
      },
    },
  ];

  function registerSkins() {
    if (typeof window.registerHermesSkin !== "function") return false;
    SKINS.forEach(function (skin) {
      window.registerHermesSkin(skin);
    });
    return true;
  }

  if (!registerSkins()) {
    var tries = 0;
    var poll = setInterval(function () {
      if (registerSkins() || ++tries > 40) clearInterval(poll);
    }, 150);
  }

  /* ── 3. SVG mark per theme ────────────────────────────────────────── */

  var MARK_SVGS = {
    "gizzyfx-pro": (
      '<svg viewBox="0 0 100 100" width="18" height="18" aria-hidden="true">' +
      '<rect x="3" y="3" width="94" height="94" rx="4" fill="#0a0a0a"/>' +
      '<rect x="3" y="3" width="94" height="94" rx="4" stroke="#3b82f6" stroke-width="3" fill="none"/>' +
      '<rect x="24" y="46" width="9" height="22" rx="1.5" fill="#22c55e"/>' +
      '<rect x="38" y="34" width="9" height="30" rx="1.5" fill="#ef4444"/>' +
      '<rect x="52" y="40" width="9" height="24" rx="1.5" fill="#22c55e"/>' +
      '<path d="M22 76 C 42 76, 60 66, 72 42" stroke="#60a5fa" stroke-width="6" stroke-linecap="round" fill="none"/>' +
      '<path d="M62 30 L82 36 L72 53 Z" fill="#60a5fa"/>' +
      '</svg>'
    ),
    "gizzyfx": (
      '<svg viewBox="0 0 100 100" width="18" height="18" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="47" fill="#040e14"/>' +
      '<circle cx="50" cy="50" r="45" stroke="#00c8e8" stroke-width="6" fill="none"/>' +
      '<rect x="24" y="46" width="9" height="22" rx="1.5" fill="#17c95c"/>' +
      '<rect x="38" y="34" width="9" height="30" rx="1.5" fill="#e8433f"/>' +
      '<rect x="52" y="40" width="9" height="24" rx="1.5" fill="#17c95c"/>' +
      '<path d="M22 76 C 42 76, 60 66, 72 42" stroke="#00e5c8" stroke-width="8" stroke-linecap="round" fill="none"/>' +
      '<path d="M62 30 L82 36 L72 53 Z" fill="#00e5c8"/>' +
      '</svg>'
    ),
    "gizzyfx-blue": (
      '<svg viewBox="0 0 100 100" width="18" height="18" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="47" fill="#030712"/>' +
      '<circle cx="50" cy="50" r="45" stroke="#3b82f6" stroke-width="6" fill="none"/>' +
      '<rect x="24" y="46" width="9" height="22" rx="1.5" fill="#17c95c"/>' +
      '<rect x="38" y="34" width="9" height="30" rx="1.5" fill="#e8433f"/>' +
      '<rect x="52" y="40" width="9" height="24" rx="1.5" fill="#17c95c"/>' +
      '<path d="M22 76 C 42 76, 60 66, 72 42" stroke="#60a5fa" stroke-width="8" stroke-linecap="round" fill="none"/>' +
      '<path d="M62 30 L82 36 L72 53 Z" fill="#60a5fa"/>' +
      '</svg>'
    ),
    "gizzyfx-purple": (
      '<svg viewBox="0 0 100 100" width="18" height="18" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="47" fill="#050807"/>' +
      '<circle cx="50" cy="50" r="45" stroke="#a78bfa" stroke-width="6" fill="none"/>' +
      '<rect x="24" y="46" width="9" height="22" rx="1.5" fill="#17c95c"/>' +
      '<rect x="38" y="34" width="9" height="30" rx="1.5" fill="#e8433f"/>' +
      '<rect x="52" y="40" width="9" height="24" rx="1.5" fill="#17c95c"/>' +
      '<path d="M22 76 C 42 76, 60 66, 72 42" stroke="#f472b6" stroke-width="8" stroke-linecap="round" fill="none"/>' +
      '<path d="M62 30 L82 36 L72 53 Z" fill="#f472b6"/>' +
      '</svg>'
    ),
  };

  function getMarkSvg() {
    var skin = document.documentElement.dataset.skin || "gizzyfx-pro";
    return MARK_SVGS[skin] || MARK_SVGS["gizzyfx-pro"];
  }

  /* ── 4. Persistent navigation bar ────────────────────────────────── */

  function buildNav() {
    if (document.getElementById("gizzyfx-nav")) return;

    var bar = document.createElement("div");
    bar.id = "gizzyfx-nav";
    bar.setAttribute("role", "navigation");
    bar.setAttribute("aria-label", "GizzyFx");

    var engine = document.createElement("a");
    engine.href = ENGINE_URL;
    engine.className = "gizzyfx-nav-link gizzyfx-nav-primary";
    engine.innerHTML = getMarkSvg() + "<span>Engine</span>";
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

  /* Update the nav mark SVG whenever the skin changes. */
  var observer = new MutationObserver(function () {
    var nav = document.getElementById("gizzyfx-nav");
    if (!nav) return;
    var primary = nav.querySelector(".gizzyfx-nav-primary");
    if (!primary) return;
    var span = primary.querySelector("span");
    primary.innerHTML = getMarkSvg() + (span ? "<span>Engine</span>" : "");
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-skin"],
  });

})();
