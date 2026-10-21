import type { GameId } from "../games/catalog.ts";
import { localStore } from "./localStore.ts";
import { dayKey } from "./rng.ts";

export interface DayStats {
  focusMinutes: number;
  sessions: number;
  solves: number;
  daily: boolean;
}

export type SolveKind = GameId | "quiz";

export interface Stats {
  days: Record<string, DayStats>;
  solvesByGame: Partial<Record<SolveKind, number>>;
  bestStreak: number;
}

const EMPTY_DAY: DayStats = { focusMinutes: 0, sessions: 0, solves: 0, daily: false };

export const statsStore = localStore<Stats>("mindvault-stats", { days: {}, solvesByGame: {}, bestStreak: 0 });

function bump(change: (day: DayStats) => DayStats, extra?: (stats: Stats) => Stats) {
  statsStore.update((current) => {
    const key = dayKey();
    const day = change({ ...EMPTY_DAY, ...current.days[key] });
    let next: Stats = { ...current, days: { ...current.days, [key]: day } };
    if (extra) next = extra(next);
    return { ...next, bestStreak: Math.max(next.bestStreak, streak(next)) };
  });
}

export function recordSession(minutes: number) {
  if (minutes <= 0) return;
  bump((day) => ({ ...day, focusMinutes: day.focusMinutes + Math.round(minutes), sessions: day.sessions + 1 }));
}

export function recordSolve(game: SolveKind) {
  bump(
    (day) => ({ ...day, solves: day.solves + 1 }),
    (stats) => ({ ...stats, solvesByGame: { ...stats.solvesByGame, [game]: (stats.solvesByGame[game] ?? 0) + 1 } }),
  );
}

export function recordDaily() {
  bump((day) => ({ ...day, daily: true }));
}

function active(day: DayStats | undefined) {
  return Boolean(day && (day.focusMinutes > 0 || day.solves > 0 || day.daily));
}

/** Consecutive active days ending today, or yesterday if today has no activity yet. */
export function streak(stats: Stats, today = new Date()): number {
  const cursor = new Date(today);
  if (!active(stats.days[dayKey(cursor)])) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (active(stats.days[dayKey(cursor)])) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function lastDays(stats: Stats, count: number, today = new Date()): { key: string; date: Date; day: DayStats }[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (count - 1 - index));
    const key = dayKey(date);
    return { key, date, day: { ...EMPTY_DAY, ...stats.days[key] } };
  });
}

export function totals(stats: Stats) {
  return Object.values(stats.days).reduce(
    (sum, day) => ({
      focusMinutes: sum.focusMinutes + day.focusMinutes,
      sessions: sum.sessions + day.sessions,
      solves: sum.solves + day.solves,
      dailies: sum.dailies + (day.daily ? 1 : 0),
    }),
    { focusMinutes: 0, sessions: 0, solves: 0, dailies: 0 },
  );
}
