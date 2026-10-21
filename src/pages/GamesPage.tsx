import { ArrowLeft, CheckCircle2, Sparkles, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { DIFFICULTIES, GAMES, gameById, type Difficulty, type GameId } from "../games/catalog.ts";
import { dailyChallenge } from "../lib/daily.ts";
import { prefsStore } from "../lib/prefs.ts";
import { dayKey } from "../lib/rng.ts";
import { recordDaily, recordSolve, statsStore } from "../lib/stats.ts";
import { toast } from "../lib/toast.ts";
import type { AppView } from "../types.ts";

type Active = { id: GameId; daily: boolean } | null;

export function GamesPage({
  view,
  onChange,
  openDaily,
  onDailyOpened,
}: {
  view: AppView;
  onChange: (view: AppView) => void;
  openDaily: boolean;
  onDailyOpened: () => void;
}) {
  const prefs = prefsStore.use();
  const stats = statsStore.use();
  const daily = dailyChallenge();
  const dailyDone = Boolean(stats.days[dayKey()]?.daily);
  const [active, setActive] = useState<Active>(null);
  const [round, setRound] = useState(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (!openDaily) return;
    setActive({ id: daily.game.id, daily: true });
    onDailyOpened();
  }, [openDaily, daily.game.id, onDailyOpened]);

  const setDifficulty = (difficulty: Difficulty) => prefsStore.update((current) => ({ ...current, difficulty }));

  const onSolved = useCallback(async () => {
    if (!active) return;
    recordSolve(active.id);
    if (active.daily) {
      recordDaily();
      toast("Daily challenge complete. Streak extended.", "good");
    } else {
      toast(`${gameById(active.id).name} solved.`, "good");
    }
    const session = viewRef.current.session;
    if (session && !session.blockCompleted) {
      try {
        onChange(await api.completeBlock());
        if (session.level !== "light") toast("End early is now unlocked on Home.", "good");
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "bad");
      }
    }
  }, [active, onChange]);

  if (active) {
    const game = gameById(active.id);
    const Game = game.component;
    const Icon = game.icon;
    const difficulty = active.daily ? daily.difficulty : prefs.difficulty;
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-center gap-4 animate-mv-rise">
          <button type="button" className="mv-icon-btn" aria-label="Back to games" onClick={() => setActive(null)}>
            <ArrowLeft className="size-4" />
          </button>
          <div className={`flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${game.tint} text-white shadow-lg`}>
            <Icon className="size-6" />
          </div>
          <div>
            <p className="mv-label">{active.daily ? "Daily challenge" : game.skill}</p>
            <h1 className="font-display text-3xl font-bold tracking-tight">{game.name}</h1>
          </div>
          {active.daily ? (
            <span className="ml-auto rounded-full bg-mv-accent/15 px-3 py-1 text-xs font-semibold text-mv-accent capitalize">{difficulty} · same for everyone today</span>
          ) : (
            <DifficultyPicker value={difficulty} onChange={(next) => { setDifficulty(next); setRound((count) => count + 1); }} className="ml-auto" />
          )}
        </header>
        <section className="mv-panel animate-mv-rise">
          <p className="mb-5 text-sm text-mv-muted">{game.blurb}</p>
          <Game key={`${active.id}-${difficulty}-${active.daily}-${round}`} difficulty={difficulty} seed={active.daily ? daily.seed : undefined} onSolved={() => void onSolved()} />
        </section>
      </div>
    );
  }

  const DailyIcon = daily.game.icon;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-mv-rise">
        <div>
          <p className="mv-label">Brain games</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Train, don't scroll</h1>
          <p className="mt-1 text-sm text-mv-muted">
            {view.session && !view.session.blockCompleted && view.session.level !== "light"
              ? "Finish any game to unlock End early."
              : "Offline, finite, and made to stretch one skill each."}
          </p>
        </div>
        <DifficultyPicker value={prefs.difficulty} onChange={setDifficulty} />
      </header>

      <button
        type="button"
        onClick={() => setActive({ id: daily.game.id, daily: true })}
        className={`group relative cursor-pointer overflow-hidden rounded-3xl bg-gradient-to-br ${daily.game.tint} p-6 text-left text-white shadow-xl animate-mv-rise`}
      >
        <div className="absolute -top-10 -right-10 size-48 rounded-full bg-white/10 blur-2xl transition group-hover:scale-125" />
        <div className="relative flex flex-wrap items-center gap-5">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-white/20 backdrop-blur">
            <DailyIcon className="size-8" />
          </div>
          <div className="flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-white/80 uppercase">
              <Sparkles className="size-3.5" /> Daily challenge · {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
            <p className="mt-1 font-display text-2xl font-bold">{daily.game.name}</p>
            <p className="text-sm text-white/85">{daily.game.blurb}</p>
          </div>
          <span className="rounded-2xl bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur">
            {dailyDone ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4" /> Done, play again
              </span>
            ) : (
              "Play now"
            )}
          </span>
        </div>
      </button>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {GAMES.map((game, index) => {
          const Icon = game.icon;
          const solves = stats.solvesByGame[game.id] ?? 0;
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => setActive({ id: game.id, daily: false })}
              className="mv-panel group flex cursor-pointer flex-col gap-4 text-left transition hover:-translate-y-1 hover:border-mv-accent/40 animate-mv-rise"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className={`flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${game.tint} text-white shadow-lg transition group-hover:scale-110`}>
                  <Icon className="size-6" />
                </div>
                {solves > 0 ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-mv-muted">
                    <Trophy className="size-3.5 text-mv-good" /> {solves}
                  </span>
                ) : null}
              </div>
              <div>
                <p className="mv-label">{game.skill}</p>
                <p className="mt-0.5 font-display text-xl font-bold">{game.name}</p>
                <p className="mt-1 text-sm text-mv-muted">{game.blurb}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DifficultyPicker({
  value,
  onChange,
  className = "",
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
  className?: string;
}) {
  return (
    <div className={`mv-segment ${className}`} role="radiogroup" aria-label="Difficulty">
      {DIFFICULTIES.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={value === level}
          className={`${value === level ? "mv-tab-on" : "mv-tab"} capitalize`}
          onClick={() => onChange(level)}
        >
          {level}
        </button>
      ))}
    </div>
  );
}
