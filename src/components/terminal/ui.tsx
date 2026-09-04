import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LoadBar } from "./anim";

/* ══════════════════════════════════════════════════════════════════════════
   GIZZYFX TERMINAL UI KIT
   ──────────────────────────────────────────────────────────────────────────
   Every surface reads from the --gz-* palette so all six themes work, and
   every control is sized from the design system's CSS classes so the
   Android-desktop-mode type scale in responsive.css applies automatically.
   The exported API is backward-compatible with the v1 kit.
   ══════════════════════════════════════════════════════════════════════════ */

/* ─── Card / panel ────────────────────────────────────────────────────── */

export function Card({
  title,
  badge,
  className,
  children,
  accent,
  loading,
  scan,
  flush,
}: {
  title?: string;
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Coloured top rail — states the panel's role at a glance. */
  accent?: "primary" | "highlight" | "pos" | "neg" | "warn" | undefined;
  /** Shows an indeterminate load bar across the panel's top edge. */
  loading?: boolean;
  /** Sweeping scan light — use while a panel is actively recomputing. */
  scan?: boolean;
  /** Removes body padding (for tables that should bleed to the edge). */
  flush?: boolean;
}) {
  const accentClass =
    accent === "primary" ? "panel-accent"
    : accent === "highlight" ? "panel-highlight"
    : accent === "pos" ? "panel-pos"
    : accent === "neg" ? "panel-neg"
    : accent === "warn" ? "panel-warn"
    : "";

  return (
    <section
      className={cn("panel fx-hover", accentClass, scan && "fx-scan", className)}
    >
      <LoadBar active={Boolean(loading)} />
      {(title || badge) && (
        <header className="panel-head">
          {title && <h2 className="panel-head-title">{title}</h2>}
          {badge}
        </header>
      )}
      <div className={flush ? "panel-body-flush" : "panel-body"}>{children}</div>
    </section>
  );
}

/* ─── Badge ───────────────────────────────────────────────────────────── */

export function Badge({
  tone = "blue",
  className,
  children,
  live,
}: {
  tone?: "blue" | "green" | "red" | "amber" | "neutral" | undefined;
  className?: string;
  children: ReactNode;
  /** Adds a pulsing dot — for LIVE / STREAMING states. */
  live?: boolean;
}) {
  const tones = {
    blue: "badge-info",
    green: "badge-success",
    red: "badge-danger",
    amber: "badge-warning",
    neutral: "badge-neutral",
  } as const;
  return (
    <span className={cn("badge", tones[tone], className)}>
      {live && (
        <span
          className="pulse-dot"
          style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "currentColor", boxShadow: "0 0 5px currentColor",
            flexShrink: 0,
          }}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

/* ─── Form controls ──────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="ctl-label">{label}</span>
      {children}
      {hint && <span className="ctl-hint">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("ctl", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn("ctl appearance-none pr-7", props.className)}>
      {props.children}
    </select>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "success";
}) {
  const variants = {
    primary: "btn-institutional",
    ghost: "btn-ghost",
    danger: "btn-danger",
    success: "btn-success",
  } as const;
  return <button {...props} className={cn("btn btn-sweep", variants[variant], className)} />;
}

/** Filled accent button — the single primary action on a page. */
export function ActionButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cn("btn btn-primary btn-sweep", className)} />;
}

/** Segmented control — phase toggles, timeframe pickers. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("seg", className)} role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={o.value === value}
          className="seg-item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Data display ───────────────────────────────────────────────────── */

const TONE_COLOR = {
  default: "oklch(var(--gz-txt))",
  pos: "oklch(var(--gz-pos))",
  neg: "oklch(var(--gz-neg))",
  accent: "oklch(var(--gz-p))",
  warn: "oklch(var(--gz-warn))",
} as const;

export function Row({
  label,
  value,
  tone = "default",
  strong,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "pos" | "neg" | "accent" | "warn";
  strong?: boolean;
}) {
  return (
    <div className={cn("kv", strong && "kv-strong")}>
      <span className="kv-label">{label}</span>
      <span className="kv-value" style={{ color: TONE_COLOR[tone] }}>{value}</span>
    </div>
  );
}

export function Alert({
  level,
  title,
  children,
  breathe,
}: {
  level: "green" | "red" | "amber" | "blue";
  title: string;
  children?: ReactNode;
  /** Slow glow pulse — for states the user must not miss. */
  breathe?: boolean;
}) {
  const tones = {
    green: "alert-green",
    red: "alert-red",
    amber: "alert-amber",
    blue: "alert-blue",
  } as const;
  return (
    <div className={cn("alert", tones[level], breathe && "fx-alert-breathe")}>
      <p className="alert-title">{title}</p>
      {children && <p className="alert-body">{children}</p>}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
  sub,
  accessory,
}: {
  label: string;
  value: ReactNode;
  tone?: string | undefined;
  /** Secondary line under the number — context, not decoration. */
  sub?: ReactNode;
  /** Right-aligned slot: sparkline, gauge, badge. */
  accessory?: ReactNode;
}) {
  return (
    <div className="stat fx-hover">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="stat-label">{label}</p>
          <p className={cn("stat-value", tone)}>{value}</p>
          {sub && <p className="stat-sub">{sub}</p>}
        </div>
        {accessory && <div className="flex-shrink-0">{accessory}</div>}
      </div>
    </div>
  );
}

/* ─── Layout helpers ─────────────────────────────────────────────────── */

/** The instrument identity strip at the top of a workspace. */
export function CockpitHeader({
  title,
  badges,
  right,
}: {
  title: string;
  badges?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="cockpit-header">
      <div className="cockpit-header-left">
        <span className="cockpit-title">{title}</span>
        {badges}
      </div>
      {right && <div className="cockpit-header-right">{right}</div>}
    </div>
  );
}

/** Dense institutional table wrapper. */
export function DataGrid({
  head,
  children,
  ruled = true,
  className,
}: {
  head: ReadonlyArray<{ label: string; align?: "left" | "right" }>;
  children: ReactNode;
  ruled?: boolean;
  className?: string;
}) {
  return (
    <div className="w-full overflow-x-auto scrollbar-institutional">
      <table className={cn("dgrid", ruled && "dgrid-ruled", className)}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h.label} style={h.align === "right" ? { textAlign: "right" } : undefined}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** LONG / SHORT chip. */
export function DirectionChip({ dir }: { dir: string }) {
  const long = dir.toUpperCase().startsWith("L") || dir.toUpperCase() === "BUY";
  return <span className={long ? "dir-long" : "dir-short"}>{dir}</span>;
}
