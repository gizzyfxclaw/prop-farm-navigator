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
      className={cn("card-neon lift rounded-xl p-5", className)}
      style={{
        background: "oklch(0.128 0.024 292 / 0.72)",
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        border: "1px solid oklch(0.680 0.230 295 / 0.13)",
        boxShadow: "0 0 12px oklch(0.680 0.230 295 / 0.08), inset 0 1px 0 oklch(1 0 0 / 0.04)",
      }}
    >
      {(title || badge) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2
              className="font-display text-[11px] font-semibold uppercase text-muted-foreground"
              style={{ letterSpacing: "0.22em" }}
            >
              {title}
            </h2>
          )}
          {badge}
        </header>
      )}
      {children}
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
    blue:    "bg-primary/12 text-primary border border-primary/25",
    green:   "bg-success/12 text-success border border-success/25",
    red:     "bg-destructive/12 text-destructive border border-destructive/25",
    amber:   "bg-warning/12 text-warning border border-warning/25",
    neutral: "bg-muted/80 text-muted-foreground border border-white/[0.06]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]",
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="text-[10.5px] text-muted-foreground/70">{hint}</span>}
    </label>
  );
}

const controlClass =
  "h-11 w-full rounded-lg px-3 font-mono text-sm text-foreground outline-none transition-all " +
  "bg-input border border-border " +
  "focus:border-primary/50 focus:ring-2 focus:ring-primary/25 " +
  "disabled:opacity-60";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(controlClass, "appearance-none pr-8", props.className)}>
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
      "btn-sweep bg-gradient-to-br from-primary to-primary/80 text-primary-foreground " +
      "shadow-[0_0_20px_oklch(0.680_0.230_295_/_0.30)] hover:shadow-[0_0_28px_oklch(0.680_0.230_295_/_0.45)]",
    ghost:
      "border border-border bg-secondary/60 text-foreground backdrop-blur-sm " +
      "hover:bg-secondary hover:border-primary/30",
    danger:
      "bg-destructive/15 border border-destructive/35 text-destructive hover:bg-destructive/25",
    success:
      "btn-sweep bg-gradient-to-br from-success to-success/80 text-background " +
      "shadow-[0_0_20px_oklch(0.680_0.230_295_/_0.30)]",
  } as const;

  return (
    <button
      {...props}
      className={cn(
        "press inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold",
        "transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
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
    default: "text-foreground",
    pos: "text-success",
    neg: "text-destructive",
    accent: "text-primary",
    warn: "text-warning",
  } as const;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-1.5 text-[13px]",
        strong && "mt-1 border-t border-border pt-2.5 font-semibold",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono tabular-nums", tones[tone])}>{value}</span>
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
    green: "border-success/40 bg-success/10 text-success",
    red: "border-destructive/40 bg-destructive/10 text-destructive",
    amber: "border-warning/40 bg-warning/10 text-warning",
  } as const;
  return (
    <div className={cn("rounded-lg border p-4 backdrop-blur-sm", tones[level])}>
      <p className="font-display text-sm font-bold uppercase tracking-[0.12em]">{title}</p>
      {children && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/80">{children}</p>
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
    <div
      className="lift rounded-xl p-4"
      style={{
        background: "oklch(0.128 0.024 292 / 0.72)",
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        border: "1px solid oklch(0.680 0.230 295 / 0.13)",
      }}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-2 font-mono text-2xl font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}
