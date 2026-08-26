import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
        "rounded-2xl border border-border bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.25)]",
        className,
      )}
    >
      {(title || badge) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
  children,
}: {
  tone?: "blue" | "green" | "red" | "amber" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    blue: "bg-primary/15 text-primary",
    green: "bg-success/15 text-success",
    red: "bg-destructive/15 text-destructive",
    amber: "bg-warning/15 text-warning",
    neutral: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

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
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="text-[10.5px] text-muted-foreground/70">{hint}</span>}
    </label>
  );
}

const controlClass =
  "h-11 w-full rounded-xl border border-border bg-input px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-60";

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
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_6px_20px_rgba(37,99,235,0.3)]",
    ghost: "border border-border bg-secondary text-foreground hover:bg-muted",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    success: "bg-success text-background hover:bg-success/90",
  } as const;
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    />
  );
}

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
      <span className={cn("font-mono", tones[tone])}>{value}</span>
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
    <div className={cn("rounded-xl border p-4", tones[level])}>
      <p className="text-sm font-bold uppercase tracking-[0.08em]">{title}</p>
      {children && <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/80">{children}</p>}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-mono text-2xl font-bold", tone)}>{value}</p>
    </div>
  );
}
