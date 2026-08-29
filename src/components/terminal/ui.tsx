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
      className={cn("card-neon rounded-xl p-5", className)}
      style={{
        background: "oklch(0.110 0.012 145 / 0.72)",
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        border: "1px solid oklch(0.780 0.220 145 / 0.13)",
        boxShadow: "0 0 12px oklch(0.780 0.220 145 / 0.08), inset 0 1px 0 oklch(1 0 0 / 0.04)",
      }}
    >
      {(title || badge) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2
              className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
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
  tone?: "blue" | "green" | "red" | "amber" | "neutral";
  className?: string;
  children: ReactNode;
}) {
  const tones: Record<typeof tone, React.CSSProperties> = {
    blue:    { background: "oklch(0.780 0.220 145 / 0.12)", color: "oklch(0.780 0.220 145)", border: "1px solid oklch(0.780 0.220 145 / 0.22)" },
    green:   { background: "oklch(0.780 0.220 145 / 0.12)", color: "oklch(0.780 0.220 145)", border: "1px solid oklch(0.780 0.220 145 / 0.22)" },
    red:     { background: "oklch(0.637 0.208 25.3 / 0.12)", color: "oklch(0.637 0.208 25.3)", border: "1px solid oklch(0.637 0.208 25.3 / 0.22)" },
    amber:   { background: "oklch(0.769 0.153 70.1 / 0.12)", color: "oklch(0.769 0.153 70.1)", border: "1px solid oklch(0.769 0.153 70.1 / 0.22)" },
    neutral: { background: "oklch(0.175 0.012 145 / 0.80)", color: "oklch(0.560 0.040 145)", border: "1px solid oklch(0.780 0.220 145 / 0.08)" },
  };
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]", className)}
      style={tones[tone]}
    >
      {children}
    </span>
  );
}

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "destructive";
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

  if (variant === "ghost") {
    return (
      <button
        className={cn(base, "px-3 py-2 text-muted-foreground hover:text-foreground", className)}
        style={{ background: "transparent" }}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "destructive") {
    return (
      <button
        className={cn(base, "h-9 px-4 text-destructive-foreground", className)}
        style={{
          background: "oklch(0.637 0.208 25.3 / 0.15)",
          border: "1px solid oklch(0.637 0.208 25.3 / 0.30)",
          color: "oklch(0.637 0.208 25.3)",
        }}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      className={cn(base, "h-9 px-4", className)}
      style={{
        background: "linear-gradient(135deg, oklch(0.780 0.220 145), oklch(0.700 0.200 145))",
        color: "oklch(0.060 0.010 145)",
        boxShadow: "0 0 18px oklch(0.780 0.220 145 / 0.30)",
      }}
      {...props}
    >
      {children}
    </button>
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
    <div className="space-y-1.5">
      <label className="block text-[12px] font-medium tracking-wide text-muted-foreground uppercase" style={{ letterSpacing: "0.10em" }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Select({
  className,
  style,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("rounded-lg px-3 font-mono text-[13px] text-foreground outline-none transition-colors focus:ring-2 focus:ring-ring", className)}
      style={{
        background: "oklch(0.120 0.012 145 / 0.80)",
        border: "1px solid oklch(0.780 0.220 145 / 0.18)",
        backdropFilter: "blur(8px)",
        ...style,
      }}
      {...props}
    />
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px] text-foreground">{value}</span>
    </div>
  );
}
