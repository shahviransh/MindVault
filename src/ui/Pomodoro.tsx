import { Coffee, Target } from "lucide-react";
import { useEffect, useRef } from "react";
import { prefsStore } from "../lib/prefs.ts";
import { announce } from "../lib/toast.ts";
import type { SessionRow } from "../types.ts";
import { formatClock } from "./TimerRing.tsx";

export interface PomodoroPhase {
  phase: "focus" | "break";
  round: number;
  left: number;
  length: number;
}

/** Derived from the session start, so it survives reloads without any stored state. */
export function pomodoroPhase(startedAt: string, now: number, focusMinutes: number, breakMinutes: number): PomodoroPhase {
  const focus = focusMinutes * 60_000;
  const rest = breakMinutes * 60_000;
  const elapsed = Math.max(0, now - new Date(startedAt).getTime());
  const cycle = focus + rest;
  const position = elapsed % cycle;
  const round = Math.floor(elapsed / cycle) + 1;
  return position < focus
    ? { phase: "focus", round, left: focus - position, length: focus }
    : { phase: "break", round, left: cycle - position, length: rest };
}

export function Pomodoro({ session, now }: { session: SessionRow; now: number }) {
  const prefs = prefsStore.use();
  const current = pomodoroPhase(session.startedAt, now, prefs.focusMinutes, prefs.breakMinutes);
  const key = `${current.round}-${current.phase}`;
  const previous = useRef(key);

  useEffect(() => {
    if (!prefs.pomodoro || previous.current === key) return;
    previous.current = key;
    if (current.phase === "break") {
      announce("Break time", `Round ${current.round} done. Rest your eyes for ${prefs.breakMinutes} minutes.`);
    } else {
      announce("Back to focus", `Round ${current.round} starts now.`);
    }
  }, [key, prefs.pomodoro, current.phase, current.round, prefs.breakMinutes]);

  if (!prefs.pomodoro) return null;
  const focus = current.phase === "focus";
  const Icon = focus ? Target : Coffee;
  const percent = Math.round((1 - current.left / current.length) * 100);

  return (
    <div className="rounded-2xl border border-mv-line bg-mv-field p-4">
      <div className="flex items-center gap-3">
        <div className={`flex size-10 items-center justify-center rounded-xl ${focus ? "bg-mv-accent/15 text-mv-accent" : "bg-mv-good/15 text-mv-good"}`}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {focus ? "Focus" : "Break"} · round {current.round}
          </p>
          <p className="text-xs text-mv-muted">
            {focus ? `${prefs.focusMinutes} min focus, then ${prefs.breakMinutes} min break` : "Stand up, stretch, look away"}
          </p>
        </div>
        <span className="font-display text-xl font-semibold tabular-nums">{formatClock(current.left)}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mv-line">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${focus ? "bg-gradient-to-r from-mv-accent to-mv-accent-2" : "bg-mv-good"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
