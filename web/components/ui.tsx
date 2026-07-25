import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface ${className}`}>{children}</div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular mt-1 text-2xl font-bold text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-primary text-on-primary hover:bg-primary-hover",
    ghost: "border border-border bg-surface text-foreground hover:bg-muted",
    danger: "border border-border bg-surface text-destructive hover:bg-muted",
  }[variant];

  return (
    <button
      {...props}
      className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" }) {
  const styles = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-primary/10 text-primary",
    warn: "bg-accent/10 text-accent",
  }[tone];
  return (
    <span className={`tabular inline-block rounded px-1.5 py-0.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Card className="px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}
