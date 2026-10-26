import { ArrowRight, BookOpen, CalendarClock, CheckCircle2, Clock, Flame, Gamepad2, Play, Sparkles, Trophy } from "lucide-react";
import { useState } from "react";
import { api } from "../api.ts";
import { dailyChallenge } from "../lib/daily.ts";
import { dayKey } from "../lib/rng.ts";
import { statsStore, streak } from "../lib/stats.ts";
import { toast } from "../lib/toast.ts";
import type { AppView, Level, Schedule } from "../types.ts";
import { Pomodoro } from "../ui/Pomodoro.tsx";
import { SessionControls } from "../ui/SessionControls.tsx";
import type { Page } from "../ui/Sidebar.tsx";
import { TimerRing } from "../ui/TimerRing.tsx";

export const LEVELS: { id: Level; title: string; copy: string; tag: string }[] = [
  { id: "light", title: "Light", tag: "AI apps", copy: "Stops AI apps and CLIs. Browser stays open. Pause with your PIN." },
  { id: "standard", title: "Standard", tag: "+ AI sites", copy: "Also closes the browser and blocks AI sites and their APIs. Earn early exit with a game or quiz." },
  { id: "full", title: "Full", tag: "+ entertainment", copy: "Standard, plus Steam, YouTube, Netflix, and the extra entertainment list in Settings." },
];

const PRESETS = [25, 45, 90, 120];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function greeting(now: Date) {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function nextSchedule(schedules: Schedule[], now: Date): { schedule: Schedule; at: Date } | null {
  let best: { schedule: Schedule; at: Date } | null = null;
  for (const schedule of schedules) {
    const [hours, minutes] = schedule.start.split(":").map(Number);
    for (let ahead = 0; ahead < 8; ahead += 1) {
      const at = new Date(now);
      at.setDate(at.getDate() + ahead);
      at.setHours(hours, minutes, 0, 0);
      if (at <= now || !schedule.days.includes((at.getDay() + 6) % 7)) continue;
      if (!best || at < best.at) best = { schedule, at };
      break;
    }
  }
  return best;
}

export function HomePage({
  view,
  now,
  onChange,
  onPage,
  onDaily,
}: {
  view: AppView;
  now: number;
  onChange: (view: AppView) => void;
  onPage: (page: Page) => void;
  onDaily: () => void;
}) {
  const stats = statsStore.use();
  const today = stats.days[dayKey()];
  const daily = dailyChallenge();
  const DailyIcon = daily.game.icon;
  const date = new Date(now);
  const upcoming = nextSchedule(view.schedules, date);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <header className="animate-mv-rise">
          <p className="mv-label">{date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">
            {greeting(date)}. <span className="mv-gradient-text">{view.session ? "You're locked in." : "Ready to think?"}</span>
          </h1>
        </header>
        {view.session ? (
          <ActiveSession view={view} now={now} onChange={onChange} onPage={onPage} />
        ) : (
          <StartSession noteFiles={view.noteFiles} onChange={onChange} />
        )}
      </div>

      <div className="flex flex-col gap-5">
        <section className="mv-panel animate-mv-rise overflow-hidden p-0 sm:p-0">
          <div className={`bg-gradient-to-br ${daily.game.tint} p-5 text-white`}>
            <div className="flex items-center justify-between">
              <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-white/80 uppercase">Daily challenge</p>
              <Sparkles className="size-4 text-white/80" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
                <DailyIcon className="size-6" />
              </div>
              <div>
                <p className="font-display text-xl font-bold">{daily.game.name}</p>
                <p className="text-xs text-white/80">
                  {daily.game.skill} · {daily.difficulty}
                </p>
              </div>
            </div>
          </div>
          <div className="p-5">
            {today?.daily ? (
              <p className="flex items-center gap-2 text-sm font-medium text-mv-good">
                <CheckCircle2 className="size-4" /> Done for today. New one tomorrow.
              </p>
            ) : (
              <button type="button" className="mv-btn w-full" onClick={onDaily}>
                <Play className="size-4" /> Play today's puzzle
              </button>
            )}
          </div>
        </section>

        <section className="mv-panel animate-mv-rise">
          <p className="mv-label">Today</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Metric icon={Flame} value={streak(stats)} label="streak" tone="text-orange-500" />
            <Metric icon={Clock} value={today?.focusMinutes ?? 0} label="focus min" tone="text-mv-accent" />
            <Metric icon={Trophy} value={today?.solves ?? 0} label="solved" tone="text-mv-good" />
          </div>
          <button type="button" className="mv-btn-ghost mt-4 w-full" onClick={() => onPage("stats")}>
            See all stats <ArrowRight className="size-4" />
          </button>
        </section>

        <section className="mv-panel animate-mv-rise">
          <p className="mv-label flex items-center gap-1.5">
            <CalendarClock className="size-3.5" /> Next scheduled lock
          </p>
          {upcoming ? (
            <p className="mt-2 text-sm">
              <strong className="capitalize">{upcoming.schedule.level}</strong> on{" "}
              {DAY_NAMES[(upcoming.at.getDay() + 6) % 7]} at {upcoming.schedule.start} for {upcoming.schedule.minutes} min
            </p>
          ) : (
            <p className="mt-2 text-sm text-mv-muted">Nothing scheduled.</p>
          )}
          <button type="button" className="mv-btn-ghost mt-3 w-full" onClick={() => onPage("settings")}>
            {upcoming ? "Edit schedules" : "Add a schedule"}
          </button>
        </section>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value, label, tone }: { icon: typeof Flame; value: number; label: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-mv-line bg-mv-field px-2 py-3">
      <Icon className={`mx-auto size-4 ${tone}`} />
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[0.7rem] text-mv-muted">{label}</p>
    </div>
  );
}

function ActiveSession({
  view,
  now,
  onChange,
  onPage,
}: {
  view: AppView;
  now: number;
  onChange: (view: AppView) => void;
  onPage: (page: Page) => void;
}) {
  const session = view.session!;
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endsAt).getTime();
  return (
    <section className="mv-panel animate-mv-rise">
      <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
        <TimerRing remaining={end - now} total={end - start}>
          <span className="mt-1 text-xs text-mv-muted">until {new Date(end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          <span className="mt-2 rounded-full bg-mv-accent/15 px-2.5 py-0.5 text-xs font-semibold text-mv-accent capitalize">{session.level}</span>
        </TimerRing>
        <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
          <Pomodoro session={session} now={now} />
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="mv-btn-ghost justify-start py-3" onClick={() => onPage("focus")}>
              <BookOpen className="size-4 text-mv-accent" /> Open study desk
            </button>
            <button type="button" className="mv-btn-ghost justify-start py-3" onClick={() => onPage("games")}>
              <Gamepad2 className="size-4 text-mv-accent" /> Play a brain game
            </button>
          </div>
          <SessionControls session={session} onChange={onChange} onGames={() => onPage("games")} />
          <p className="text-xs text-mv-muted">
            Task Manager, Settings, a terminal, and uninstall keep working. Closing MindVault removes the firewall rules; reopening it continues this session
            until the timer ends.
          </p>
        </div>
      </div>
    </section>
  );
}

const NOTE_CHOICES = [
  { id: "pdf", label: "PDF" },
  { id: "image", label: "Pictures" },
  { id: "text", label: "Text" },
];

function StartSession({ noteFiles, onChange }: { noteFiles: string[]; onChange: (view: AppView) => void }) {
  const [level, setLevel] = useState<Level>("standard");
  const [minutes, setMinutes] = useState(45);
  const [pin, setPin] = useState("");

  async function start() {
    try {
      onChange(await api.startSession(level, minutes, level === "light" ? null : pin));
      setPin("");
      toast(`${level[0].toUpperCase()}${level.slice(1)} lock started for ${minutes} minutes.`, "good");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "bad");
    }
  }

  return (
    <section className="mv-panel animate-mv-rise">
      <h2 className="mv-title">Start a session</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {LEVELS.map((item) => (
          <button key={item.id} type="button" className={level === item.id ? "mv-level-on" : "mv-level"} onClick={() => setLevel(item.id)}>
            <span className="flex items-center justify-between">
              <strong className="font-display text-lg">{item.title}</strong>
              <span className="rounded-full bg-mv-accent/12 px-2 py-0.5 text-[0.65rem] font-semibold text-mv-accent">{item.tag}</span>
            </span>
            <span className="text-sm leading-snug text-mv-muted">{item.copy}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mv-label">Duration</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={minutes === preset ? "mv-chip border-mv-accent bg-mv-accent/15 font-semibold" : "mv-chip"}
                onClick={() => setMinutes(preset)}
              >
                {preset < 60 ? `${preset}m` : `${preset / 60}h`}
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm text-mv-muted">
              <input
                type="number"
                min={1}
                max={480}
                aria-label="Minutes, up to 480"
                className="mv-input w-24 py-1.5"
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
              min
            </label>
          </div>
        </div>
        <label className="block">
          <span className="mv-label">{level === "light" ? "PIN (not needed for Light)" : "PIN to start"}</span>
          <input
            type="password"
            aria-label="PIN to start"
            className="mv-input mt-2"
            value={pin}
            disabled={level === "light"}
            onChange={(event) => setPin(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void start();
            }}
          />
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="mv-label">Notes in the study window</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {NOTE_CHOICES.map((choice) => {
            const on = noteFiles.includes(choice.id);
            return (
              <label key={choice.id} className={on ? "mv-chip border-mv-accent bg-mv-accent/15 font-semibold" : "mv-chip"}>
                <input
                  type="checkbox"
                  className="size-3.5 accent-violet-600"
                  checked={on}
                  onChange={() => {
                    const next = on ? noteFiles.filter((kind) => kind !== choice.id) : [...noteFiles, choice.id];
                    void api.setNoteFiles(next).then(onChange).catch((error: unknown) => {
                      toast(error instanceof Error ? error.message : String(error), "bad");
                    });
                  }}
                />
                {choice.label}
              </label>
            );
          })}
        </div>
        <p className="mt-2 max-w-xl text-xs text-mv-muted">
          Turn these on before the session if you want to open your own notes. The choice freezes at the start. Web pages stay on the study list.
        </p>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" className="mv-btn px-6 py-3 text-base" onClick={() => void start()}>
          <Play className="size-4" /> Start {level} lock
        </button>
        <p className="max-w-md text-xs text-mv-muted">
          Standard and Full ask for permission to add firewall rules. Denying that cancels the session. Max 8 hours. Win+L and Task Manager still work.
        </p>
      </div>
    </section>
  );
}
