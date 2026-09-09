import { createFileRoute } from "@tanstack/react-router";
import {
  Shield, Zap, Target, TrendingUp, TrendingDown, Clock, DollarSign,
  ShieldCheck, ShieldX, AlertTriangle, Lock, Activity, Eye,
  BookOpen, Cpu, BarChart3, ClipboardList, Settings, Globe, ChevronRight,
  Monitor, FileWarning, CheckCircle2, ArrowRightLeft, RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & Documentation — GizzyFx" },
      { name: "description", content: "Complete guide to the GizzyFx Institutional Prop Farming Terminal." },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="engine-cockpit">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="cockpit-header">
        <div className="cockpit-header-left">
          <span className="cockpit-title">Help & Documentation</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "oklch(var(--gz-p) / 0.15)", color: "oklch(var(--gz-p))" }}>
            GizzyFx v1.0
          </span>
        </div>
      </div>

      {/* ── SECTION 1: WHAT IS GIZZYFX HOLY TRINITY STRATEGY ─────────────── */}
      <Section title="What is GizzyFx Holy Trinity Strategy?" icon={<BookOpen size={16} />} id="what">
        <p style={{ color: "oklch(var(--gz-txt))", fontSize: 13, lineHeight: 1.7 }}>
          The <strong>GizzyFx Holy Trinity Strategy</strong> is a three-part prop farming system designed to pass funded trading challenges with zero net loss. It combines <strong>Dynamic Exness Re-Pacing</strong> (handles Prop slippage), <strong>Targeted Slippage Martingale</strong> (handles Exness slippage), and <strong>Real-Time Risk Sentinel</strong> (monitors everything). Together, they form a self-healing loop that recovers your prop fee even when slippage occurs.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <InfoCard icon={<Shield size={16} />} title="Trinity Part 1: Re-Pacing" items={["Handles Prop slippage", "Recalculates target for fewer legs", "Prevents fee recovery shortfall"]} />
          <InfoCard icon={<Activity size={16} />} title="Trinity Part 2: Martingale" items={["Handles Exness slippage", "Adds debt to next target", "Heals short wins automatically"]} />
          <InfoCard icon={<Eye size={16} />} title="Trinity Part 3: Sentinel" items={["Monitors all pages real-time", "Blocks execution if rules broken", "Acts as personal trading coach"]} />
        </div>
        <div className="mt-3 p-3 rounded-lg" style={{ background: "oklch(var(--gz-s2) / 0.5)", border: "1px solid oklch(var(--gz-p) / 0.15)" }}>
          <div className="text-[11px] font-bold mb-1" style={{ color: "oklch(var(--gz-p))" }}>
            The Combined Formula:
          </div>
          <div className="text-[12px] font-mono" style={{ color: "oklch(var(--gz-txt))" }}>
            Final Exness Win Target = Dynamic Base Target (Re-Pacing) + Slippage Debt (Martingale)
          </div>
        </div>
      </Section>

      {/* ── SECTION 2: HOW THE SITE WORKS ─────────────────────────────── */}
      <Section title="How the Site Works — Page by Page" icon={<Globe size={16} />} id="pages">
        <Table
          headers={["Page", "Purpose", "What You Do There"]}
          rows={[
            ["Engine", "Core calculator", "Set entry/SL/R:R → See lot sizes → Execute trades"],
            ["Daily Briefing", "Morning checklist", "Read Risk Sentinel → Complete pre-flight → Hunt setups"],
            ["Calendar", "News & sessions", "Check red-folder news → Confirm trading window"],
            ["Journal", "Trade log", "Log each trade result → Sync Exness history"],
            ["Live MT5", "Account monitor", "Verify Exness balance → Confirm connection"],
            ["Trading Agent", "AI analysis", "Chat with Hermes → Get trade setups"],
            ["Backtest", "Strategy test", "Test strategies over historical data"],
            ["SMC Analysis", "Smart Money", "Analyze market structure → Find entries"],
            ["Accounts", "Settings", "Add/edit accounts → Set daily caps"],
            ["Settings", "Configuration", "MetaApi keys → Account IDs → Preferences"],
          ]}
        />
      </Section>

      {/* ── SECTION 3: HOW THE ENGINE WORKS ──────────────────────────── */}
      <Section title="How the Engine Works — Step by Step" icon={<Cpu size={16} />} id="engine">
        <Table
          headers={["Step", "Action", "Result"]}
          rows={[
            ["1", "Select pair & direction", "EURUSD LONG or SHORT — sets hedge direction"],
            ["2", "Set entry price", "Your intended entry (e.g., 1.0850)"],
            ["3", "Set SL pips", "Stop loss distance (e.g., 30 pips)"],
            ["4", "Select R:R", "Reward:risk ratio (1.5, 2, 2.5, or 3)"],
            ["5", "Engine calculates", "Prop risk, Exness lots, Exness target, capital needed"],
            ["6", "Click Execute Exness", "Places pending order on Exness account"],
            ["7", "Wait for green confirmation", "MetaApi confirms order filled"],
            ["8", "Place Prop trade manually", "Same direction/price on phone app"],
            ["9", "Log result in Journal", "WIN or LOSS → system recalculates next trade"],
          ]}
        />
      </Section>

      {/* ── SECTION 4: THE MATH (HOW CALCULATIONS WORK) ──────────────── */}
      <Section title="The Math — How Everything is Calculated" icon={<BarChart3 size={16} />} id="math">
        <Table
          headers={["Calculation", "Formula", "Why It Matters"]}
          rows={[
            ["Prop risk", "Fixed $50 per trade (or your setting)", "How much Prop loses if SL hit"],
            ["Exness win target", "Prop fee ÷ losses to blow", "How much Exness must win per trade"],
            ["Exness lot size", "Win target ÷ (TP pips × $0.10)", "Lot size for next Exness trade"],
            ["Exness loss target", "Win target × R:R", "How much Exness loses if Prop wins"],
            ["Buffered capital", "Exness loss × 1.20 (20% buffer)", "Total Exness capital needed"],
            ["Re-Pacing (slippage)", "Remaining fee ÷ remaining legs", "Adjusts target if Prop slips"],
            ["Martingale (slippage)", "Add debt to next target", "Adjusts target if Exness slips"],
          ]}
        />
      </Section>

      {/* ── SECTION 5: PHASE 1 vs PHASE 2 ─────────────────────────────── */}
      <Section title="Phase 1 (Challenge) vs Phase 2 (Funded)" icon={<TrendingUp size={16} />} id="phases">
        <Table
          headers={["Feature", "Phase 1 — Challenge", "Phase 2 — Mega Shield"]}
          rows={[
            ["Goal", "Reach profit target", "Protect profits + grow"],
            ["Prop risk", "Standard ($50)", "Reduced (profit preservation)"],
            ["Lot sizes", "Calculated for challenge", "Adjusted for funded rules"],
            ["Drawdown", "Challenge limit", "Funded limit (stricter)"],
            ["Daily cap", "$100/day", "Still applies"],
            ["Checklist", "6 rules", "8 rules (extra funded checks)"],
          ]}
        />
      </Section>

      {/* ── SECTION 6: RISK SENTINEL ─────────────────────────────────── */}
      <Section title="Risk Sentinel — Real-Time Monitor" icon={<Eye size={16} />} id="sentinel">
        <p style={{ color: "oklch(var(--gz-txt))", fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
          The Risk Sentinel is a floating widget that monitors ALL pages in real-time and tells you what to do (or not do). It appears in the bottom-right corner of every page.
        </p>
        <Table
          headers={["Status", "Color", "Meaning"]}
          rows={[
            ["STOP", "Red", "Critical issue — DO NOT TRADE. Fix the problem first."],
            ["CAUTION", "Amber", "Warning — proceed with extra care or wait."],
            ["COACH", "Green", "All clear — follow your rules and execute."],
          ]}
        />
        <div className="mt-3" style={{ background: "oklch(var(--gz-s2) / 0.5)", borderRadius: 8, padding: 12 }}>
          <div className="text-[11px] font-bold mb-2" style={{ color: "oklch(var(--gz-p))" }}>
            What the Sentinel Monitors:
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MonitorItem label="Market hours" desc="Blocks weekend trading" />
            <MonitorItem label="Daily cap" desc="Blocks if already won today" />
            <MonitorItem label="Exness buffer" desc="Blocks if balance too low" />
            <MonitorItem label="Critical legs" desc="Blocks if ≤2 legs left" />
            <MonitorItem label="Session window" desc="Warns if off-peak" />
            <MonitorItem label="MT5 connection" desc="Warns if not connected" />
            <MonitorItem label="Journal data" desc="Warns if bad P&L signs" />
            <MonitorItem label="Phase status" desc="Shows phase 2 warning" />
          </div>
        </div>
      </Section>

      {/* ── SECTION 7: EXECUTION RULES ────────────────────────────────── */}
      <Section title="Execution Rules — The Non-Negotiables" icon={<FileWarning size={16} />} id="rules">
        <Table
          headers={["Rule", "Category", "Consequence if Broken"]}
          rows={[
            ["Exness FIRST → Prop SECOND", "CRITICAL execution", "Slippage breaks the hedge"],
            ["Check Live MT5 tab before trading", "CRITICAL execution", "May trade with wrong balance"],
            ["Wait for green confirmation", "Execution", "Premature Prop entry = risk"],
            ["Same price on both accounts", "Execution", "Price mismatch = P&L gap"],
            ["NO trading ±30min red news", "Compliance", "Spread blowout = slippage"],
            ["Vary entry times", "Compliance", "Round numbers = prop AI flag"],
            ["Vary SL pips (28, 35, 22)", "Compliance", "Consistency = prop AI flag"],
            ["Log trades immediately", "Journal", "Bad data = wrong calculations"],
            ["Daily cap $100/day", "Compliance", "Breach = challenge failed"],
          ]}
        />
      </Section>

      {/* ── SECTION 8: CHECKLIST EXPLAINED ────────────────────────────── */}
      <Section title="Daily Briefing Checklist — What Each Item Means" icon={<ClipboardList size={16} />} id="checklist">
        <Table
          headers={["Checklist Item", "What It Means"]}
          rows={[
            ["Check ForexFactory — NO red news", "Visit forexfactory.com. Red-folder events cause spread blowout."],
            ["13:00–16:00 EST window", "London/NY overlap = best liquidity, lowest spread."],
            ["Exness FIRST → Prop SECOND", "Always place Exness order first. Wait for confirmation. Then Prop."],
            ["Check Live MT5 tab", "Verify MetaApi is connected and shows live balance before trading."],
            ["Execute Exness via button", "Use the Engine's Execute button — it calculates everything."],
            ["Prop on phone at EXACT price", "Same entry price as Exness. No deviation."],
            ["Daily cap rule", "If you win today. STOP. Come back tomorrow."],
            ["Log loss in Journal", "If Prop loses, log it. System recalculates Exness target."],
            ["Funded lot size confirmed", "Phase 2 only: Verify lot size matches funded rules."],
            ["Drawdown limit not breached", "Phase 2 only: Check you haven't exceeded max drawdown."],
          ]}
        />
      </Section>

      {/* ── SECTION 9: RECOVERY SYSTEM ────────────────────────────────── */}
      <Section title="Recovery System — How Losses Are Healed" icon={<RefreshCw size={16} />} id="recovery">
        <Table
          headers={["Scenario", "What Happens", "System Response"]}
          rows={[
            ["Prop loses $50 (normal)", "Exness wins $4.33", "Recovery loop continues as planned"],
            ["Prop loses $56 (slippage)", "Exness wins $4.33", "Re-Pacing: target increases to $4.79"],
            ["Exness wins $4.10 (short)", "Prop loses $50", "Martingale: $0.23 debt added to next target"],
            ["Both happen at once", "Prop -$56, Exness +$4.10", "Combined: target = $4.79 + $0.23 = $5.02"],
            ["0 legs remaining", "Account near blowout", "CRITICAL WARNING — trade with extreme caution"],
          ]}
        />
      </Section>

      {/* ── SECTION 10: DAILY WORKFLOW ────────────────────────────────── */}
      <Section title="Daily Workflow — From Morning to Execution" icon={<Clock size={16} />} id="workflow">
        <Table
          headers={["Time", "Action", "Page"]}
          rows={[
            ["Morning", "Open Daily Briefing → Read Risk Sentinel", "Daily Briefing"],
            ["Morning", "Complete all checklist items (8-10 checks)", "Daily Briefing"],
            ["Morning", "Check Calendar for red news", "Calendar"],
            ["Morning", "Verify MT5 connection & balance", "Live MT5"],
            ["13:00 EST", "Switch to Engine → Set entry/SL/R:R", "Engine"],
            ["13:00 EST", "Verify lot sizes and capital needed", "Engine"],
            ["13:00 EST", "Click Execute Exness → Wait for green", "Engine"],
            ["After green", "Place Prop trade on phone at exact price", "Phone app"],
            ["After trade", "Log result in Journal", "Journal"],
            ["After log", "System recalculates → Ready for next trade", "Engine"],
            ["After win", "STOP trading for the day (Daily Cap Rule)", "Any"],
          ]}
        />
      </Section>

      {/* ── SECTION 11: TROUBLESHOOTING ───────────────────────────────── */}
      <Section title="Troubleshooting — Common Issues" icon={<AlertTriangle size={16} />} id="troubleshoot">
        <Table
          headers={["Problem", "Cause", "Solution"]}
          rows={[
            ["Execute button greyed out", "Execution lock active", "Check Risk Sentinel for red alerts"],
            ["Can't switch to Phase 2", "Challenge not passed yet", "Reach profit target first"],
            ["Exness target too high", "Multiple slippage events", "Trade carefully — don't add more slippage"],
            ["Buffer depleted warning", "Exness balance too low", "Deposit to Exness → Update balance in Settings"],
            ["Daily cap lock active", "Already won today", "Wait until tomorrow (UTC midnight)"],
            ["MT5 not connecting", "Wrong MetaApi credentials", "Check Settings → Verify token & account ID"],
            ["Bad journal data warning", "Wrong P&L signs logged", "Clear journal → Re-log with correct signs"],
            ["Off-peak warning", "Outside London/NY overlap", "Wait for 13:00 EST (17:00 UTC)"],
          ]}
        />
      </Section>

      {/* ── SECTION 12: GLOSSARY ──────────────────────────────────────── */}
      <Section title="Glossary — Key Terms" icon={<BookOpen size={16} />} id="glossary">
        <Table
          headers={["Term", "Definition"]}
          rows={[
            ["Prop firm", "Company that gives you a funded account after passing a challenge"],
            ["Challenge", "Evaluation period where you must hit a profit target without breaching rules"],
            ["Exness", "Retail broker used as the hedge account (wins when Prop loses)"],
            ["Hedge", "Two opposite positions: one wins, one loses"],
            ["R:R", "Reward:risk ratio — how much you win vs. how much you lose"],
            ["Lot size", "Trade volume — 1.00 lot = $0.10 per pip on Cent accounts"],
            ["SL", "Stop loss — price where trade closes for a loss"],
            ["TP", "Take profit — price where trade closes for a win"],
            ["Drawdown", "Peak-to-trough decline in account balance"],
            ["Martingale", "Increasing position size after a loss to recover"],
            ["Re-Pacing", "Adjusting target when Prop slippage reduces remaining legs"],
            ["Slippage", "Difference between expected and actual fill price"],
            ["Pending order", "Order that triggers only when price reaches a set level"],
            ["MetaApi", "API service that connects the terminal to your broker"],
          ]}
        />
      </Section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <div className="text-center py-6">
        <div className="text-[11px] font-mono" style={{ color: "oklch(var(--gz-mut))" }}>
          GIZZYFX — Institutional Prop Farming Terminal
        </div>
        <div className="text-[10px] mt-1" style={{ color: "oklch(var(--gz-mut) / 0.7)" }}>
          For support, contact your administrator or visit the Trading Agent tab.
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function Section({ title, icon, id, children }: { title: string; icon: React.ReactNode; id: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: "oklch(var(--gz-p))" }}>{icon}</span>
        <h2 className="text-[14px] font-bold uppercase tracking-wider" style={{ color: "oklch(var(--gz-p))" }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid oklch(var(--gz-p) / 0.15)" }}>
      <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "oklch(var(--gz-s2))" }}>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left px-3 py-2 font-bold uppercase tracking-wider"
                style={{ color: "oklch(var(--gz-p))", borderBottom: "1px solid oklch(var(--gz-p) / 0.2)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid oklch(var(--gz-p) / 0.08)" }}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-2"
                  style={{
                    color: j === 0 ? "oklch(var(--gz-p))" : "oklch(var(--gz-txt))",
                    fontWeight: j === 0 ? 600 : 400,
                    background: i % 2 === 0 ? "transparent" : "oklch(var(--gz-s2) / 0.3)",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoCard({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="panel-sunken" style={{ padding: 12 }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: "oklch(var(--gz-p))" }}>{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "oklch(var(--gz-p))" }}>{title}</span>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-[10px] flex items-center gap-1.5" style={{ color: "oklch(var(--gz-txt))" }}>
            <ChevronRight size={8} style={{ color: "oklch(var(--gz-p))" }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MonitorItem({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 size={10} style={{ color: "oklch(var(--gz-pos))", marginTop: 2, flexShrink: 0 }} />
      <div>
        <div className="text-[10px] font-bold" style={{ color: "oklch(var(--gz-txt))" }}>{label}</div>
        <div className="text-[9px]" style={{ color: "oklch(var(--gz-mut))" }}>{desc}</div>
      </div>
    </div>
  );
}
