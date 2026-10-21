import { Award, CalendarCheck, Clock, Flame, GraduationCap, Lock, Trophy } from "lucide-react";
import { GAMES } from "../games/catalog.ts";
import { lastDays, statsStore, streak, totals } from "../lib/stats.ts";

function hours(minutes: number) {
  return minutes >= 60 ? `${(minutes / 60).toFixed(minutes >= 600 ? 0 : 1)}h` : `${minutes}m`;
}

export function StatsPage() {
  const stats = statsStore.use();
  const sum = totals(stats);
  const current = streak(stats);
  const days = lastDays(stats, 14);
  const peak = Math.max(30, ...days.map((entry) => entry.day.focusMinutes));
  const weeks = lastDays(stats, 7 * 12);
  const gameRows = [
    ...GAMES.map((game) => ({ name: game.name, icon: game.icon, tint: game.tint, count: stats.solvesByGame[game.id] ?? 0 })),
    { name: "Tutor quizzes", icon: GraduationCap, tint: "from-indigo-500 to-violet-500", count: stats.solvesByGame.quiz ?? 0 },
  ];
  const topGame = Math.max(1, ...gameRows.map((row) => row.count));

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-mv-rise">
        <p className="mv-label">Stats</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Your sharpening, in numbers</h1>
        <p className="mt-1 text-sm text-mv-muted">Stored only on this device.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card icon={Flame} tone="from-orange-500 to-amber-500" label="Current streak" value={`${current} day${current === 1 ? "" : "s"}`} sub={`Best ${stats.bestStreak}`} />
        <Card icon={Clock} tone="from-violet-500 to-indigo-500" label="Focus time" value={hours(sum.focusMinutes)} sub={`${sum.sessions} sessions`} />
        <Card icon={Trophy} tone="from-emerald-500 to-teal-500" label="Puzzles solved" value={String(sum.solves)} sub="games and quizzes" />
        <Card icon={CalendarCheck} tone="from-cyan-500 to-sky-500" label="Daily challenges" value={String(sum.dailies)} sub="completed" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="mv-panel animate-mv-rise">
          <h2 className="mv-title">Focus minutes, last 14 days</h2>
          <div className="mt-6 flex h-48 items-end gap-2">
            {days.map(({ key, date, day }) => {
              const height = Math.round((day.focusMinutes / peak) * 100);
              const today = key === days[days.length - 1].key;
              return (
                <div key={key} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[0.65rem] font-semibold text-mv-muted opacity-0 transition group-hover:opacity-100">{day.focusMinutes}m</span>
                  <div
                    className={`w-full rounded-t-lg transition-all duration-700 ${day.focusMinutes > 0 ? "bg-gradient-to-t from-mv-accent to-mv-accent-2" : "bg-mv-line"} ${today ? "ring-2 ring-mv-accent/40 ring-offset-2 ring-offset-transparent" : ""}`}
                    style={{ height: `${Math.max(4, height)}%` }}
                    title={`${date.toLocaleDateString()}: ${day.focusMinutes} min`}
                  />
                  <span className={`text-[0.65rem] ${today ? "font-bold text-mv-ink" : "text-mv-muted"}`}>
                    {date.toLocaleDateString(undefined, { weekday: "narrow" })}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mv-panel animate-mv-rise">
          <h2 className="mv-title">Solves by game</h2>
          <div className="mt-4 flex flex-col gap-3">
            {gameRows.map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.name} className="flex items-center gap-3">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${row.tint} text-white`}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate">{row.name}</span>
                      <span className="font-semibold tabular-nums">{row.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-mv-line">
                      <div className={`h-full rounded-full bg-gradient-to-r ${row.tint}`} style={{ width: `${(row.count / topGame) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="mv-panel animate-mv-rise">
        <h2 className="mv-title flex items-center gap-2">
          <Award className="size-5 text-mv-accent" /> Last 12 weeks
        </h2>
        <div className="mt-4 grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1" style={{ gridAutoColumns: "minmax(0.85rem, 1fr)" }}>
          {weeks.map(({ key, date, day }) => {
            const level = day.focusMinutes >= 120 ? 4 : day.focusMinutes >= 60 ? 3 : day.focusMinutes > 0 || day.solves > 2 ? 2 : day.solves > 0 || day.daily ? 1 : 0;
            const shades = ["bg-mv-line", "bg-mv-accent/30", "bg-mv-accent/55", "bg-mv-accent/80", "bg-mv-accent"];
            return <div key={key} className={`aspect-square rounded-[0.25rem] ${shades[level]}`} title={`${date.toLocaleDateString()}: ${day.focusMinutes} min, ${day.solves} solved`} />;
          })}
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[0.65rem] text-mv-muted">
          Less
          {["bg-mv-line", "bg-mv-accent/30", "bg-mv-accent/55", "bg-mv-accent/80", "bg-mv-accent"].map((shade) => (
            <span key={shade} className={`size-3 rounded-[0.2rem] ${shade}`} />
          ))}
          More
        </div>
      </section>

      {sum.sessions === 0 && sum.solves === 0 ? (
        <p className="flex items-center justify-center gap-2 text-sm text-mv-muted">
          <Lock className="size-4" /> Finish a session or a game and your numbers start here.
        </p>
      ) : null}
    </div>
  );
}

function Card({ icon: Icon, tone, label, value, sub }: { icon: typeof Flame; tone: string; label: string; value: string; sub: string }) {
  return (
    <section className="mv-panel animate-mv-rise">
      <div className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-lg`}>
        <Icon className="size-5" />
      </div>
      <p className="mv-label mt-4">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs text-mv-muted">{sub}</p>
    </section>
  );
}
