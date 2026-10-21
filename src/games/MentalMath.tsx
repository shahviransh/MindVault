import { useRef, useState } from "react";
import { seeded, type Rng } from "../lib/rng.ts";
import type { Difficulty, GameProps } from "./catalog.ts";
import { Progress, Status } from "./Status.tsx";

interface Problem {
  text: string;
  answer: number;
}

const SETTINGS: Record<Difficulty, { target: number; add: [number, number]; times: [number, number] }> = {
  easy: { target: 8, add: [2, 30], times: [2, 9] },
  medium: { target: 10, add: [10, 99], times: [2, 12] },
  hard: { target: 12, add: [50, 499], times: [6, 25] },
};

function between(rng: Rng, [low, high]: [number, number]) {
  return low + Math.floor(rng() * (high - low + 1));
}

function nextProblem(difficulty: Difficulty, rng: Rng): Problem {
  const { add, times } = SETTINGS[difficulty];
  const kind = Math.floor(rng() * (difficulty === "hard" ? 4 : 3));
  if (kind === 0) {
    const left = between(rng, add);
    const right = between(rng, add);
    return { text: `${left} + ${right}`, answer: left + right };
  }
  if (kind === 1) {
    const left = between(rng, add);
    const right = between(rng, [1, left]);
    return { text: `${left} − ${right}`, answer: left - right };
  }
  if (kind === 2) {
    const left = between(rng, times);
    const right = between(rng, [2, difficulty === "hard" ? 12 : times[1]]);
    return { text: `${left} × ${right}`, answer: left * right };
  }
  const divisor = between(rng, [3, 12]);
  const quotient = between(rng, [4, 30]);
  return { text: `${divisor * quotient} ÷ ${divisor}`, answer: quotient };
}

export function MentalMath({ difficulty, seed, onSolved }: GameProps) {
  const rng = useRef<Rng>(seed === undefined ? Math.random : seeded(seed));
  const [problem, setProblem] = useState(() => nextProblem(difficulty, rng.current));
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [entry, setEntry] = useState("");
  const [shake, setShake] = useState(0);
  const [done, setDone] = useState(false);
  const target = SETTINGS[difficulty].target;

  function submit() {
    if (done || entry.trim() === "") return;
    if (Number(entry) !== problem.answer) {
      setMisses((count) => count + 1);
      setShake((count) => count + 1);
      return;
    }
    const nextScore = score + 1;
    setScore(nextScore);
    setEntry("");
    if (nextScore >= target) {
      setDone(true);
      onSolved();
      return;
    }
    setProblem(nextProblem(difficulty, rng.current));
  }

  return (
    <div className="max-w-lg">
      <Progress value={score} max={target} />
      <div
        key={`${problem.text}-${shake}`}
        className={`mt-6 rounded-3xl border border-mv-line bg-mv-solid/50 py-10 text-center ${shake ? "animate-mv-pop" : "animate-mv-rise"}`}
      >
        <p className="font-display text-5xl font-semibold tracking-tight tabular-nums">{done ? "Done" : problem.text}</p>
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          inputMode="numeric"
          aria-label="Answer"
          autoFocus
          className="mv-input text-center text-lg tabular-nums"
          value={entry}
          disabled={done}
          onChange={(event) => setEntry(event.target.value.replace(/[^\d-]/g, ""))}
          placeholder="Your answer"
        />
        <button type="submit" className="mv-btn px-6" disabled={done}>
          Enter
        </button>
      </form>
      {done ? (
        <Status tone="good">
          {target} correct{misses ? ` with ${misses} miss${misses === 1 ? "" : "es"}` : ", no misses"}.
        </Status>
      ) : misses > 0 ? (
        <Status tone="bad">Not quite. Try that one again.</Status>
      ) : null}
    </div>
  );
}
