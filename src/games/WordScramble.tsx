import { Lightbulb, SkipForward } from "lucide-react";
import { useRef, useState } from "react";
import { seeded, shuffle, type Rng } from "../lib/rng.ts";
import type { Difficulty, GameProps } from "./catalog.ts";
import { Progress, Status } from "./Status.tsx";
import { scramble, WORDS } from "./words.ts";

const TARGET: Record<Difficulty, number> = { easy: 5, medium: 6, hard: 8 };
const SKIPS = 3;

export function WordScramble({ difficulty, seed, onSolved }: GameProps) {
  const rng = useRef<Rng>(seed === undefined ? Math.random : seeded(seed));
  const [deck] = useState(() => shuffle(WORDS[difficulty], rng.current));
  const [position, setPosition] = useState(0);
  const [mixed, setMixed] = useState(() => scramble(deck[0], rng.current));
  const [entry, setEntry] = useState("");
  const [score, setScore] = useState(0);
  const [skips, setSkips] = useState(SKIPS);
  const [hints, setHints] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [done, setDone] = useState(false);
  const target = TARGET[difficulty];
  const word = deck[position % deck.length];

  function advance() {
    const next = position + 1;
    setPosition(next);
    setMixed(scramble(deck[next % deck.length], rng.current));
    setEntry("");
    setHints(0);
    setWrong(false);
  }

  function submit() {
    if (done) return;
    if (entry.trim().toLowerCase() !== word) {
      setWrong(true);
      return;
    }
    const nextScore = score + 1;
    setScore(nextScore);
    if (nextScore >= target) {
      setDone(true);
      onSolved();
      return;
    }
    advance();
  }

  return (
    <div className="max-w-lg">
      <Progress value={score} max={target} />
      <div key={mixed} className="mt-6 flex animate-mv-rise flex-wrap justify-center gap-2">
        {(done ? word : mixed).split("").map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className={`flex size-12 items-center justify-center rounded-2xl border font-display text-2xl font-bold uppercase ${
              index < hints || done
                ? "border-mv-accent/50 bg-mv-accent/15 text-mv-accent"
                : "border-mv-line bg-mv-solid/60 text-mv-ink"
            }`}
          >
            {index < hints && !done ? word[index] : letter}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-mv-muted">
        {word.length} letters{hints > 0 && !done ? ` · starts with "${word.slice(0, hints).toUpperCase()}"` : ""}
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          aria-label="Your word"
          autoFocus
          className="mv-input text-center text-lg tracking-widest uppercase"
          value={entry}
          disabled={done}
          onChange={(event) => {
            setEntry(event.target.value.replace(/[^a-zA-Z]/g, ""));
            setWrong(false);
          }}
          placeholder="Type the word"
        />
        <button type="submit" className="mv-btn px-6" disabled={done}>
          Enter
        </button>
      </form>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="mv-btn-ghost"
          disabled={done || hints >= word.length - 2}
          onClick={() => setHints((count) => count + 1)}
        >
          <Lightbulb className="size-4" /> Hint
        </button>
        <button
          type="button"
          className="mv-btn-ghost"
          disabled={done || skips === 0}
          onClick={() => {
            setSkips((count) => count - 1);
            advance();
          }}
        >
          <SkipForward className="size-4" /> Skip ({skips})
        </button>
      </div>
      {done ? (
        <Status tone="good">{target} words unscrambled.</Status>
      ) : wrong ? (
        <Status tone="bad">Not that one. Rearrange and try again.</Status>
      ) : null}
    </div>
  );
}
