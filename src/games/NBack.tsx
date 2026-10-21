import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pick, seeded, type Rng } from "../lib/rng.ts";
import type { Difficulty, GameProps } from "./catalog.ts";
import { Progress, Status } from "./Status.tsx";

const LETTERS = ["B", "F", "H", "K", "M", "Q", "R", "T"];
const PASS = 0.8;

const SETTINGS: Record<Difficulty, { n: number; trials: number; ms: number }> = {
  easy: { n: 1, trials: 16, ms: 2000 },
  medium: { n: 2, trials: 20, ms: 1800 },
  hard: { n: 3, trials: 24, ms: 1500 },
};

export function buildNBack(n: number, trials: number, rng: Rng): string[] {
  const letters: string[] = [];
  for (let index = 0; index < trials; index += 1) {
    if (index >= n && rng() < 0.32) {
      letters.push(letters[index - n]);
    } else {
      let letter = pick(LETTERS, rng);
      while (index >= n && letter === letters[index - n]) letter = pick(LETTERS, rng);
      letters.push(letter);
    }
  }
  return letters;
}

export function scoreNBack(letters: string[], n: number, pressed: Set<number>): number {
  let correct = 0;
  letters.forEach((letter, index) => {
    const match = index >= n && letters[index - n] === letter;
    if (match === pressed.has(index)) correct += 1;
  });
  return correct / letters.length;
}

export function NBack({ difficulty, seed, onSolved }: GameProps) {
  const { n, trials, ms } = SETTINGS[difficulty];
  const rng = useRef<Rng>(seed === undefined ? Math.random : seeded(seed));
  const [letters, setLetters] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [visible, setVisible] = useState(false);
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);
  const [result, setResult] = useState<number | null>(null);
  const running = index >= 0 && index < letters.length;

  useEffect(() => {
    if (!running) return;
    setVisible(true);
    const hide = window.setTimeout(() => setVisible(false), ms * 0.7);
    const next = window.setTimeout(() => setIndex((current) => current + 1), ms);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(next);
    };
  }, [index, running, ms]);

  useEffect(() => {
    if (letters.length === 0 || index < letters.length || result !== null) return;
    const score = scoreNBack(letters, n, pressed);
    setResult(score);
    if (score >= PASS) onSolved();
  }, [index, letters, n, pressed, onSolved, result]);

  function start() {
    setLetters(buildNBack(n, trials, rng.current));
    setPressed(new Set());
    setResult(null);
    setIndex(0);
  }

  function match() {
    if (!running || pressed.has(index)) return;
    setPressed((current) => new Set(current).add(index));
    const isMatch = index >= n && letters[index - n] === letters[index];
    setFlash(isMatch ? "hit" : "miss");
    window.setTimeout(() => setFlash(null), 250);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.key.toLowerCase() === "m") {
        event.preventDefault();
        match();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="max-w-md">
      <p className="text-sm text-mv-muted">
        Tap <strong className="text-mv-ink">Match</strong> (or press Space) when the letter is the same as the one{" "}
        <strong className="text-mv-ink">{n === 1 ? "just before" : `${n} steps back`}</strong>. Score {PASS * 100}% or
        better to finish.
      </p>
      <div className="mt-4">
        <Progress value={Math.max(0, Math.min(index, letters.length))} max={trials} />
      </div>
      <div
        className={`mt-5 flex h-44 items-center justify-center rounded-3xl border bg-mv-solid/50 transition ${
          flash === "hit" ? "border-mv-good ring-4 ring-mv-good/20" : flash === "miss" ? "border-mv-bad ring-4 ring-mv-bad/20" : "border-mv-line"
        }`}
      >
        {running && visible ? (
          <span key={index} className="animate-mv-pop font-display text-7xl font-bold mv-gradient-text">
            {letters[index]}
          </span>
        ) : (
          <span className="text-sm text-mv-muted">{running ? "" : result === null ? "Ready when you are." : ""}</span>
        )}
        {result !== null && !running ? (
          <span className="font-display text-4xl font-semibold tabular-nums">{Math.round(result * 100)}%</span>
        ) : null}
      </div>
      <div className="mt-4 flex gap-2">
        {running ? (
          <button type="button" className="mv-btn flex-1 py-3 text-base" onClick={match}>
            Match
          </button>
        ) : (
          <button type="button" className="mv-btn flex-1 py-3 text-base" onClick={start}>
            <Play className="size-4" /> {result === null ? "Start" : "Play again"}
          </button>
        )}
      </div>
      {result !== null ? (
        result >= PASS ? (
          <Status tone="good">Sharp. {Math.round(result * 100)}% accuracy at {n}-back.</Status>
        ) : (
          <Status tone="bad">{Math.round(result * 100)}% this round. Reach {PASS * 100}% to finish.</Status>
        )
      ) : null}
    </div>
  );
}
