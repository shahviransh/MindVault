import type { ReactNode } from "react";

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

export function TimerRing({
  remaining,
  total,
  size = 240,
  children,
}: {
  remaining: number;
  total: number;
  size?: number;
  children?: ReactNode;
}) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="mv-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--mv-accent)" />
            <stop offset="100%" stopColor="var(--mv-accent-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--mv-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#mv-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: "stroke-dashoffset 1s linear", filter: "drop-shadow(0 0 10px color-mix(in oklab, var(--mv-accent) 45%, transparent))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-4xl font-semibold tracking-tight tabular-nums">{formatClock(remaining)}</span>
        {children}
      </div>
    </div>
  );
}
