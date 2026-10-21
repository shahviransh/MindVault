import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";

export function Status({ tone = "info", children }: { tone?: "info" | "good" | "bad"; children: ReactNode }) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "bad" ? CircleAlert : Info;
  const color = tone === "good" ? "text-mv-good" : tone === "bad" ? "text-mv-bad" : "text-mv-muted";
  return (
    <p className={`mt-3 flex animate-mv-rise items-center gap-2 text-sm ${color}`} role="status">
      <Icon className="size-4 shrink-0" />
      {children}
    </p>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const percent = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-mv-line">
        <div
          className="h-full rounded-full bg-gradient-to-r from-mv-accent to-mv-accent-2 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-mv-muted tabular-nums">
        {value}/{max}
      </span>
    </div>
  );
}
