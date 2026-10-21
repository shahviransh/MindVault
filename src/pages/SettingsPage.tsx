import {
  Bell,
  CalendarClock,
  Cpu,
  Globe,
  KeyRound,
  Lock,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  ShieldBan,
  Sun,
  Timer,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../api.ts";
import { DIFFICULTIES } from "../games/catalog.ts";
import { hostKind } from "../hostCatalog.ts";
import { CLOUD_BASE, CLOUD_MODEL, isLoopbackBase, LOCAL_PRESETS } from "../lib/endpoint.ts";
import { prefsStore } from "../lib/prefs.ts";
import { toast } from "../lib/toast.ts";
import type { Theme } from "../theme.ts";
import type { AppView, Level, Schedule } from "../types.ts";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Section({ icon: Icon, title, hint, children }: { icon: typeof Bell; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mv-panel animate-mv-rise">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mv-accent/12 text-mv-accent">
          <Icon className="size-[1.1rem]" />
        </div>
        <div>
          <h2 className="mv-title text-lg">{title}</h2>
          {hint ? <p className="text-sm text-mv-muted">{hint}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${checked ? "bg-gradient-to-r from-[#7c3aed] to-[#0891b2]" : "bg-mv-line"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-[1.375rem]" : "left-0.5"}`} />
    </button>
  );
}

export function SettingsPage({
  view,
  onChange,
  theme,
  onTheme,
  onReplayTour,
}: {
  view: AppView;
  onChange: (view: AppView) => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onReplayTour: () => void;
}) {
  const prefs = prefsStore.use();
  const [pin, setPin] = useState("");
  const locked = Boolean(view.session);

  async function save(action: () => Promise<AppView>, done: string) {
    try {
      onChange(await action());
      toast(done, "good");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "bad");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-mv-rise">
        <div>
          <p className="mv-label">Settings</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Make it yours</h1>
        </div>
        <div className="mv-panel flex items-center gap-3 p-3 sm:p-3">
          <KeyRound className="ml-1 size-4 text-mv-accent" />
          {locked ? (
            <p className="pr-2 text-sm text-mv-muted">Lock settings are frozen until the session ends.</p>
          ) : (
            <input
              type="password"
              aria-label="PIN to save lock settings"
              placeholder="PIN to save lock settings"
              className="mv-input w-60 py-2"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
          )}
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section icon={Palette} title="Appearance" hint="Saved on this device.">
          <div className="mv-segment">
            {(["light", "dark"] as Theme[]).map((option) => (
              <button key={option} type="button" className={theme === option ? "mv-tab-on" : "mv-tab"} onClick={() => onTheme(option)}>
                {option === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                <span className="capitalize">{option}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Default game difficulty</p>
              <p className="text-xs text-mv-muted">You can change it on the games page too.</p>
            </div>
            <div className="mv-segment">
              {DIFFICULTIES.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`${prefs.difficulty === level ? "mv-tab-on" : "mv-tab"} capitalize`}
                  onClick={() => prefsStore.update((current) => ({ ...current, difficulty: level }))}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="mv-btn-ghost mt-5" onClick={onReplayTour}>
            <RotateCcw className="size-4" /> Replay the welcome tour
          </button>
        </Section>

        <Section icon={Timer} title="Pomodoro" hint="Focus blocks and short breaks inside every session.">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">Show focus and break timer</p>
            <Toggle label="Pomodoro" checked={prefs.pomodoro} onChange={(value) => prefsStore.update((current) => ({ ...current, pomodoro: value }))} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block text-sm text-mv-muted">
              Focus minutes
              <input
                type="number"
                min={5}
                max={120}
                className="mv-input mt-1"
                value={prefs.focusMinutes}
                onChange={(event) => prefsStore.update((current) => ({ ...current, focusMinutes: clamp(Number(event.target.value), 5, 120) }))}
              />
            </label>
            <label className="block text-sm text-mv-muted">
              Break minutes
              <input
                type="number"
                min={1}
                max={60}
                className="mv-input mt-1"
                value={prefs.breakMinutes}
                onChange={(event) => prefsStore.update((current) => ({ ...current, breakMinutes: clamp(Number(event.target.value), 1, 60) }))}
              />
            </label>
          </div>
          <button
            type="button"
            className="mv-btn-ghost mt-4"
            onClick={() => {
              if (typeof Notification === "undefined") {
                toast("Notifications are not available here. In-app alerts still show.", "info");
                return;
              }
              void Notification.requestPermission().then((result) =>
                toast(result === "granted" ? "Break reminders will show as notifications." : "Notifications stay off. In-app alerts still show.", "info"),
              );
            }}
          >
            <Bell className="size-4" /> Allow break notifications
          </button>
        </Section>
      </div>

      <Schedules view={view} locked={locked} onSave={(list) => void save(() => api.setSchedules(pin, list), "Schedules saved.")} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Sites view={view} locked={locked} onSave={(hosts) => void save(() => api.setAllowlist(pin, hosts), "Site list saved.")} />
        <TutorKey view={view} locked={locked} pin={pin} save={save} />
      </div>

      <Classify view={view} locked={locked} pin={pin} save={save} />
    </div>
  );
}

function clamp(value: number, low: number, high: number) {
  return Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value))) : low;
}

function Schedules({ view, locked, onSave }: { view: AppView; locked: boolean; onSave: (list: Schedule[]) => void }) {
  const [draft, setDraft] = useState<Schedule[]>(view.schedules);
  const dirty = JSON.stringify(draft) !== JSON.stringify(view.schedules);

  const edit = (index: number, change: Partial<Schedule>) =>
    setDraft((list) => list.map((item, position) => (position === index ? { ...item, ...change } : item)));

  return (
    <Section
      icon={CalendarClock}
      title="Scheduled sessions"
      hint="Start a lock automatically while MindVault is running. Same 8-hour cap and recovery key. Each schedule fires once per day."
    >
      <div className="flex flex-col gap-3">
        {draft.length === 0 ? <p className="text-sm text-mv-muted">No schedules yet. Try weekdays at 9:00 for 3 hours.</p> : null}
        {draft.map((item, index) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-mv-line bg-mv-field p-3">
            <div className="flex gap-1">
              {DAYS.map((day, dayIndex) => {
                const on = item.days.includes(dayIndex);
                return (
                  <button
                    key={dayIndex}
                    type="button"
                    title={DAY_LABELS[dayIndex]}
                    aria-label={DAY_LABELS[dayIndex]}
                    aria-pressed={on}
                    disabled={locked}
                    className={`size-8 cursor-pointer rounded-lg text-xs font-bold transition ${
                      on ? "bg-gradient-to-br from-[#7c3aed] to-[#0891b2] text-white" : "border border-mv-line text-mv-muted hover:border-mv-accent/50"
                    }`}
                    onClick={() =>
                      edit(index, {
                        days: on ? item.days.filter((value) => value !== dayIndex) : [...item.days, dayIndex].sort((a, b) => a - b),
                      })
                    }
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <input
              type="time"
              aria-label="Start time"
              className="mv-input w-32 py-1.5"
              value={item.start}
              disabled={locked}
              onChange={(event) => edit(index, { start: event.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-mv-muted">
              <input
                type="number"
                min={1}
                max={480}
                aria-label="Minutes"
                className="mv-input w-20 py-1.5"
                value={item.minutes}
                disabled={locked}
                onChange={(event) => edit(index, { minutes: clamp(Number(event.target.value), 1, 480) })}
              />
              min
            </label>
            <select
              aria-label="Level"
              className="mv-input w-32 py-1.5 capitalize"
              value={item.level}
              disabled={locked}
              onChange={(event) => edit(index, { level: event.target.value as Level })}
            >
              <option value="light">Light</option>
              <option value="standard">Standard</option>
              <option value="full">Full</option>
            </select>
            <button
              type="button"
              className="mv-icon-btn ml-auto size-9 hover:border-mv-bad/50 hover:bg-mv-bad/10 hover:text-mv-bad"
              aria-label="Remove schedule"
              disabled={locked}
              onClick={() => setDraft((list) => list.filter((_, position) => position !== index))}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="mv-btn-ghost"
          disabled={locked || draft.length >= 12}
          onClick={() =>
            setDraft((list) => [
              ...list,
              { id: `s${Date.now().toString(36)}`, days: [0, 1, 2, 3, 4], start: "09:00", minutes: 180, level: "standard" },
            ])
          }
        >
          <Plus className="size-4" /> Add schedule
        </button>
        <button type="button" className="mv-btn" disabled={locked || !dirty} onClick={() => onSave(draft)}>
          <Lock className="size-4" /> Save with PIN
        </button>
        {dirty ? (
          <button type="button" className="mv-btn-ghost" onClick={() => setDraft(view.schedules)}>
            Discard
          </button>
        ) : null}
      </div>
    </Section>
  );
}

function Sites({ view, locked, onSave }: { view: AppView; locked: boolean; onSave: (hosts: string[]) => void }) {
  const [hosts, setHosts] = useState(view.allowHosts.join("\n"));
  const list = hosts
    .split(/\n+/)
    .map((host) => host.trim())
    .filter(Boolean);
  const studyCount = list.filter((host) => hostKind(host) === "study").length;
  const gameCount = list.length - studyCount;

  return (
    <Section icon={Globe} title="Study & puzzle sites" hint="One host per line. They open in MindVault's own browser. The list freezes when a session starts.">
      <textarea className="mv-input min-h-48 font-mono text-xs leading-relaxed" value={hosts} disabled={locked} onChange={(event) => setHosts(event.target.value)} />
      <p className="mt-2 text-xs text-mv-muted">
        {studyCount} study {studyCount === 1 ? "site" : "sites"} · {gameCount} puzzle game {gameCount === 1 ? "site" : "sites"}
      </p>
      <button type="button" className="mv-btn mt-3" disabled={locked} onClick={() => onSave(list)}>
        <Lock className="size-4" /> Save list with PIN
      </button>
      <details className="mt-4 text-xs text-mv-muted">
        <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
          <ShieldBan className="size-3.5" /> Always blocked ({view.denyHosts.length})
        </summary>
        <p className="mt-2 leading-relaxed">{view.denyHosts.join(", ")}</p>
      </details>
    </Section>
  );
}

type Save = (action: () => Promise<AppView>, done: string) => Promise<void>;

function TutorKey({ view, locked, pin, save }: { view: AppView; locked: boolean; pin: string; save: Save }) {
  const [base, setBase] = useState(view.apiBase);
  const [model, setModel] = useState(view.model);
  const [apiKey, setApiKey] = useState("");
  const local = isLoopbackBase(base);
  const ready = local || view.hasApiKey;

  return (
    <Section
      icon={KeyRound}
      title="Tutor"
      hint="Quizzes, summaries, flashcards, grading, and explain-back. Still buttons only, with no chat box. A cloud key is stored in Windows Credential Manager. A model on this computer needs no key."
    >
      <div className="mv-segment" role="radiogroup" aria-label="Tutor source">
        <button
          type="button"
          className={local ? "mv-tab" : "mv-tab-on"}
          disabled={locked}
          onClick={() => {
            if (local) {
              setBase(CLOUD_BASE);
              setModel(CLOUD_MODEL);
            }
          }}
        >
          Cloud API
        </button>
        <button
          type="button"
          className={local ? "mv-tab-on" : "mv-tab"}
          disabled={locked}
          onClick={() => {
            if (!local) {
              setBase(LOCAL_PRESETS[0].base);
              setModel(LOCAL_PRESETS[0].model);
            }
          }}
        >
          On this computer
        </button>
      </div>
      <span
        className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
          ready ? "bg-mv-good/15 text-mv-good" : "bg-mv-warn/15 text-mv-warn"
        }`}
      >
        <span className={`size-1.5 rounded-full ${ready ? "bg-mv-good" : "bg-mv-warn"}`} />
        {local ? (view.hasApiKey ? "Saved key is sent to this address" : "Local model, no key") : view.hasApiKey ? "Key saved" : "No key yet"}
      </span>
      {local ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {LOCAL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={base.replace(/\/$/, "") === preset.base ? "mv-chip border-mv-accent bg-mv-accent/15 font-semibold" : "mv-chip"}
              disabled={locked}
              onClick={() => {
                setBase(preset.base);
                setModel(preset.model);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-mv-muted">
          API base
          <input className="mv-input mt-1" value={base} disabled={locked} onChange={(event) => setBase(event.target.value)} />
        </label>
        <label className="block text-sm text-mv-muted">
          Model
          <input className="mv-input mt-1" value={model} disabled={locked} onChange={(event) => setModel(event.target.value)} />
        </label>
      </div>
      {local ? (
        <p className="mt-3 text-xs leading-relaxed text-mv-muted">
          Use an OpenAI-compatible server. Ollama is <span className="font-mono">http://127.0.0.1:11434/v1</span> and the model name is one from{" "}
          <span className="font-mono">ollama list</span>. Start it before a session. While locked, the Ollama server stays up so the tutor can use it.{" "}
          <span className="font-mono">ollama run</span> in a terminal is still closed. Plain http is allowed only for this computer.
        </p>
      ) : (
        <label className="mt-3 block text-sm text-mv-muted">
          API key
          <input type="password" className="mv-input mt-1" value={apiKey} disabled={locked} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" />
        </label>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="mv-btn" disabled={locked} onClick={() => void save(() => api.setApiConfig(pin, base, model), local ? "Local tutor saved." : "Endpoint saved.")}>
          <Lock className="size-4" /> {local ? "Save local tutor" : "Save endpoint"}
        </button>
        {!local ? (
          <button
            type="button"
            className="mv-btn-ghost"
            disabled={locked}
            onClick={() =>
              void save(async () => {
                const next = await api.setApiKey(pin, apiKey);
                setApiKey("");
                return next;
              }, "API key saved.")
            }
          >
            Save key with PIN
          </button>
        ) : null}
        {view.hasApiKey ? (
          <button type="button" className="mv-btn-ghost" disabled={locked} onClick={() => void save(() => api.setApiKey(pin, ""), "API key removed.")}>
            Remove saved key
          </button>
        ) : null}
      </div>
    </Section>
  );
}

function Classify({ view, locked, pin, save }: { view: AppView; locked: boolean; pin: string; save: Save }) {
  const [imageName, setImageName] = useState("");
  const [path, setPath] = useState("");
  const [publisher, setPublisher] = useState("");

  return (
    <Section icon={Cpu} title="Block another program" hint="The tutor classifies it, using the cloud key or the local model. Accepting adds it to the next session. Protected Windows programs are refused.">
      <div className="grid gap-2 sm:grid-cols-3">
        <input placeholder="name.exe" aria-label="Program file name" className="mv-input" value={imageName} disabled={locked} onChange={(event) => setImageName(event.target.value)} />
        <input placeholder="Path (optional)" aria-label="Path" className="mv-input" value={path} disabled={locked} onChange={(event) => setPath(event.target.value)} />
        <input placeholder="Publisher (optional)" aria-label="Publisher" className="mv-input" value={publisher} disabled={locked} onChange={(event) => setPublisher(event.target.value)} />
      </div>
      <button
        type="button"
        className="mv-btn-ghost mt-3"
        disabled={locked || !imageName.trim()}
        onClick={() => void save(() => api.classify(imageName, path, publisher), "Classified. Review it below.")}
      >
        Classify
      </button>
      {view.pendingSuggestion ? (
        <div className="mt-4 animate-mv-rise rounded-2xl border border-mv-accent/40 bg-mv-accent/10 p-4">
          <p className="text-sm">
            <strong>{view.pendingSuggestion.imageName}</strong> looks like <strong>{view.pendingSuggestion.category.replace("_", " ")}</strong>.{" "}
            <span className="text-mv-muted">{view.pendingSuggestion.reason}</span>
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="mv-btn" onClick={() => void save(() => api.acceptSuggestion(pin), "Added to your block list.")}>
              Accept with PIN
            </button>
            <button type="button" className="mv-btn-ghost" onClick={() => void save(() => api.dismissSuggestion(pin), "Dismissed.")}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {view.customBlocks.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {view.customBlocks.map((name) => (
            <span key={name} className="mv-chip cursor-default font-mono text-xs">
              {name}
            </span>
          ))}
        </div>
      ) : null}
    </Section>
  );
}
