import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { seeded, type Rng } from "../lib/rng.ts";
import type { Difficulty, GameProps } from "./catalog.ts";
import { Progress, Status } from "./Status.tsx";

const PADS = [
  { id: 0, label: "Violet", color: "from-violet-400 to-violet-600", glow: "shadow-violet-500/60" },
  { id: 1, label: "Cyan", color: "from-cyan-300 to-cyan-500", glow: "shadow-cyan-400/60" },
  { id: 2, label: "Lime", color: "from-lime-300 to-emerald-500", glow: "shadow-emerald-400/60" },
  { id: 3, label: "Rose", color: "from-rose-300 to-rose-500", glow: "shadow-rose-400/60" },
];

const SETTINGS: Record<Difficulty, { target: number; on: number; gap: number }> = {
  easy: { target: 5, on: 520, gap: 220 },
  medium: { target: 7, on: 420, gap: 180 },
  hard: { target: 9, on: 320, gap: 140 },
};

export function SequenceMemory({ difficulty, seed, onSolved }: GameProps) {
  const rng = useRef<Rng>(seed === undefined ? Math.random : seeded(seed));
  const alive = useRef(true);
  const [sequence, setSequence] = useState<number[]>([]);
  const [cursor, setCursor] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "good" | "bad"; text: string }>({
    tone: "info",
    text: "Press start, watch, then repeat.",
  });
  const [done, setDone] = useState(false);
  const { target, on, gap } = SETTINGS[difficulty];

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  async function play(next: number[]) {
    setPlaying(true);
    setCursor(0);
    await wait(450);
    for (const pad of next) {
      if (!alive.current) return;
      setLit(pad);
      await wait(on);
      setLit(null);
      await wait(gap);
    }
    setPlaying(false);
  }

  const nextPad = () => Math.floor(rng.current() * 4);

  async function start() {
    const next = [nextPad(), nextPad()];
    setSequence(next);
    setDone(false);
    setMessage({ tone: "info", text: "Watch the pattern." });
    await play(next);
    setMessage({ tone: "info", text: "Your turn." });
  }

  async function press(id: number) {
    if (playing || sequence.length === 0 || done) return;
    setLit(id);
    window.setTimeout(() => setLit((current) => (current === id ? null : current)), 160);
    if (sequence[cursor] !== id) {
      setMessage({ tone: "bad", text: `Missed at length ${sequence.length}. Press start to try again.` });
      setSequence([]);
      setCursor(0);
      return;
    }
    if (cursor + 1 < sequence.length) {
      setCursor(cursor + 1);
      return;
    }
    if (sequence.length >= target) {
      setDone(true);
      setMessage({ tone: "good", text: `A pattern of ${target} held. Great memory.` });
      onSolved();
      return;
    }
    const grown = [...sequence, nextPad()];
    setSequence(grown);
    setMessage({ tone: "info", text: `Length ${grown.length}. Watch.` });
    await play(grown);
    setMessage({ tone: "info", text: "Your turn." });
  }

  return (
    <div className="max-w-md">
      <Progress value={Math.max(0, sequence.length - (done ? 0 : 1))} max={target} />
      <div className="mt-5 grid grid-cols-2 gap-3">
        {PADS.map((pad) => (
          <button
            key={pad.id}
            type="button"
            aria-label={pad.label}
            className={`h-28 rounded-3xl bg-gradient-to-br ${pad.color} transition duration-150 ${
              lit === pad.id ? `scale-[1.03] opacity-100 shadow-2xl ${pad.glow} brightness-125` : "opacity-40 hover:opacity-60"
            }`}
            onClick={() => void press(pad.id)}
            disabled={playing}
          />
        ))}
      </div>
      <button type="button" className="mv-btn mt-4" onClick={() => void start()} disabled={playing}>
        <Play className="size-4" /> {sequence.length === 0 || done ? "Start" : "Restart"}
      </button>
      <Status tone={message.tone}>{message.text}</Status>
    </div>
  );
}
