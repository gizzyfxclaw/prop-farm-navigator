import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ── Surfaces ──────────────────────────────────────────────────── */

export function Card({
  title,
  badge,
  className,
  children,
}: {
  title?: string;
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "bg-[#0a0a0a] border border-[#1a1a1a]",
        className,
      )}
    >
      {(title || badge) && (
        <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[#1a1a1a] bg-[#0f0f0f]">
          {title && (
            <h2
              className="font-mono text-[10px] font-bold uppercase text-[#8a8a8a]"
              style={{ letterSpacing: "0.08em" }}
            >
              {title}
            </h2>
          )}
          {badge}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Badge({
  tone = "blue",
  className,
  children,
}: {
  tone?: "blue" | "green" | "red" | "amber" | "neutral" | undefined;
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    blue:    "bg-[#1a2a3a] text-[#6ab4ff] border border-[#2a3a4a]",
    green:   "bg-[#0a2a1a] text-[#4ade80] border border-[#1a3a2a]",
    red:     "bg-[#2a0a0a] text-[#f87171] border border-[#3a1a1a]",
    amber:   "bg-[#2a1a0a] text-[#fbbf24] border border-[#3a2a1a]",
    neutral: "bg-[#1a1a1a] text-[#8a8a8a] border border-[#2a2a2a]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Form controls ─────────────────────────────────────────────── */

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
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-bold uppercase text-[#6a6a6a] tracking-wide font-mono">
        {label}
      </span>
      {children}
      {hint && <span className="text-[9px] text-[#5a5a5a] font-mono">{hint}</span>}
    </label>
  );
}

const controlClass =
  "h-8 w-full px-2 font-mono text-[11px] text-[#e0e0e0] outline-none " +
  "bg-[#0a0a0a] border border-[#2a2a2a] " +
  "focus:border-[#4a4a4a] " +
  "placeholder:text-[#4a4a4a] " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(controlClass, "appearance-none pr-6", props.className)}>
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
    primary:
      "bg-[#1a1a1a] border border-[#3a3a3a] text-[#e0e0e0] " +
      "hover:bg-[#2a2a2a] hover:border-[#4a4a4a] " +
      "active:bg-[#0a0a0a]",
    ghost:
      "bg-transparent border border-[#2a2a2a] text-[#8a8a8a] " +
      "hover:bg-[#1a1a1a] hover:text-[#e0e0e0] hover:border-[#3a3a3a]",
    danger:
      "bg-[#2a0a0a] border border-[#4a1a1a] text-[#f87171] " +
      "hover:bg-[#3a1a1a] hover:border-[#5a2a2a]",
    success:
      "bg-[#0a2a1a] border border-[#1a4a2a] text-[#4ade80] " +
      "hover:bg-[#1a3a2a] hover:border-[#2a5a3a]",
  } as const;

  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 px-3 text-[11px] font-bold uppercase font-mono",
        "transition-colors duration-75",
        "focus-visible:outline-none focus-visible:border-[#6ab4ff]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        className,
      )}
    />
  );
}

/* ── Data display ──────────────────────────────────────────────── */

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
  const tones = {
    default: "text-[#e0e0e0]",
    pos: "#4ade80",
    neg: "#f87171",
    accent: "#6ab4ff",
    warn: "#fbbf24",
  } as const;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-0.5 text-[11px] font-mono",
        strong && "mt-1 border-t border-[#1a1a1a] pt-1.5 font-bold",
      )}
    >
      <span className="text-[#6a6a6a] uppercase tracking-wide">{label}</span>
      <span className="tabular-nums" style={{ color: tones[tone] }}>{value}</span>
    </div>
  );
}

export function Alert({
  level,
  title,
  children,
}: {
  level: "green" | "red" | "amber";
  title: string;
  children?: ReactNode;
}) {
  const tones = {
    green: "border-l-[#4ade80] bg-[#0a1a0a] text-[#4ade80]",
    red: "border-l-[#f87171] bg-[#1a0a0a] text-[#f87171]",
    amber: "border-l-[#fbbf24] bg-[#1a1a0a] text-[#fbbf24]",
  } as const;
  return (
    <div className={cn("border-l-2 px-3 py-2", tones[level])}>
      <p className="font-mono text-[10px] font-bold uppercase tracking-wide">{title}</p>
      {children && (
        <p className="mt-1 text-[10px] leading-snug text-[#8a8a8a]">{children}</p>
      )}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: string | undefined;
}) {
  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-2.5">
      <p className="text-[9px] font-bold uppercase text-[#6a6a6a] tracking-wide font-mono">
        {label}
      </p>
      <p className={cn("mt-1 font-mono text-lg font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}