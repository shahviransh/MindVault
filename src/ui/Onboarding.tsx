import { ArrowRight, BookOpen, CalendarClock, Gamepad2, KeyRound, Layers } from "lucide-react";
import { useState } from "react";

const STEPS = [
  {
    icon: Layers,
    title: "Pick a lock level",
    body: "Light stops AI apps and CLIs. Standard also closes your browser and blocks AI sites and their APIs. Full adds games, video, and social feeds. Sessions last up to 8 hours.",
  },
  {
    icon: BookOpen,
    title: "Study without shortcuts",
    body: "The study desk opens only sites on your list, in MindVault's own browser. Quizzes, summaries, and flashcards use a tutor you pick from a list. The free choices need no API key. There is no chat box.",
  },
  {
    icon: Gamepad2,
    title: "Train your brain",
    body: "Six offline games at three difficulties, plus a daily challenge. In Standard and Full, finishing one unlocks the End early button.",
  },
  {
    icon: CalendarClock,
    title: "Build a routine",
    body: "Schedule sessions to start on their own, use Pomodoro focus blocks, and watch your streak and focus minutes grow in Stats.",
  },
  {
    icon: KeyRound,
    title: "You stay in control",
    body: "Your recovery key always ends a session. Task Manager, Settings, a terminal, and uninstall keep working. Closing MindVault removes its firewall rules.",
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const item = STEPS[step];
  const Icon = item.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Welcome to MindVault">
      <div className="mv-panel w-full max-w-md animate-mv-pop bg-mv-solid">
        <div key={step} className="animate-mv-rise">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#0891b2] text-white shadow-xl shadow-violet-600/30">
            <Icon className="size-7" />
          </div>
          <p className="mv-label mt-5">
            {step + 1} of {STEPS.length}
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">{item.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-mv-muted">{item.body}</p>
        </div>
        <div className="mt-6 flex items-center gap-1.5">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all ${index === step ? "w-6 bg-mv-accent" : "w-1.5 bg-mv-line"}`}
            />
          ))}
          <div className="ml-auto flex gap-2">
            {!last ? (
              <button type="button" className="mv-btn-ghost py-2" onClick={onDone}>
                Skip
              </button>
            ) : null}
            <button type="button" className="mv-btn py-2" onClick={() => (last ? onDone() : setStep(step + 1))}>
              {last ? "Get started" : "Next"} <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
