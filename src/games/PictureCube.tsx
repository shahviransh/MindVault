import { Shuffle, Undo2 } from "lucide-react";
import { useState } from "react";
import { seeded } from "../lib/rng.ts";
import type { Difficulty, GameProps } from "./catalog.ts";
import { FACE_NAMES, MOVES, isSolved, scramble, solvedCube, turn, type Cube, type Move } from "./cube.ts";
import { Status } from "./Status.tsx";

const TONES = ["#8b5cf6", "#06b6d4", "#f59e0b", "#3b82f6", "#22c55e", "#f43f5e"];
const MARKS = ["●", "▲", "■", "◆", "✦", "✦", "■", "▲", "●"];
const DEPTH: Record<Difficulty, number> = { easy: 3, medium: 6, hard: 12 };

function Sticker({ id }: { id: number }) {
  const face = Math.floor(id / 9);
  return (
    <span className="mv-sticker" style={{ background: TONES[face] }}>
      {MARKS[id % 9]}
    </span>
  );
}

function FaceGrid({ stickers, name }: { stickers: number[]; name: string }) {
  return (
    <div className="relative">
      <div className="mv-face">
        {stickers.map((id, index) => (
          <Sticker key={`${id}-${index}`} id={id} />
        ))}
      </div>
      <span className="absolute -top-2 -left-2 flex size-5 items-center justify-center rounded-full bg-mv-solid text-[0.6rem] font-bold text-mv-muted ring-1 ring-mv-line">
        {name}
      </span>
    </div>
  );
}

export function PictureCube({ difficulty, seed, onSolved }: GameProps) {
  const fresh = (random: () => number) => scramble(solvedCube(), DEPTH[difficulty], random);
  const [start, setStart] = useState<Cube>(() => fresh(seed === undefined ? Math.random : seeded(seed)));
  const [cube, setCube] = useState<Cube>(start);
  const [history, setHistory] = useState<Move[]>([]);
  const [done, setDone] = useState(false);

  function apply(move: Move) {
    if (done) return;
    const next = turn(cube, move);
    setCube(next);
    setHistory((list) => [...list, move]);
    if (isSolved(next)) {
      setDone(true);
      onSolved();
    }
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last || done) return;
    const back = (last.endsWith("'") ? last[0] : `${last}'`) as Move;
    setCube(turn(cube, back));
    setHistory((list) => list.slice(0, -1));
  }

  return (
    <div>
      <p className="text-sm text-mv-muted">
        Scrambled with {DEPTH[difficulty]} turns. U up, D down, F front, B back, L left, R right. A prime (′) turns
        counter-clockwise.
      </p>
      <div className="mt-4 overflow-x-auto pb-2">
        <div className="mv-cube-net">
          <div />
          <FaceGrid stickers={cube[0]} name={FACE_NAMES[0]} />
          <div />
          <div />
          <FaceGrid stickers={cube[4]} name={FACE_NAMES[4]} />
          <FaceGrid stickers={cube[2]} name={FACE_NAMES[2]} />
          <FaceGrid stickers={cube[5]} name={FACE_NAMES[5]} />
          <FaceGrid stickers={cube[3]} name={FACE_NAMES[3]} />
          <div />
          <FaceGrid stickers={cube[1]} name={FACE_NAMES[1]} />
          <div />
          <div />
        </div>
      </div>
      <div className="mt-4 grid max-w-xl grid-cols-6 gap-1.5">
        {MOVES.map((move) => (
          <button key={move} type="button" className="mv-btn-ghost px-0 py-2 font-mono" onClick={() => apply(move)} disabled={done}>
            {move.replace("'", "′")}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="mv-btn-ghost" onClick={undo} disabled={history.length === 0 || done}>
          <Undo2 className="size-4" /> Undo
        </button>
        <button
          type="button"
          className="mv-btn-ghost"
          onClick={() => {
            setCube(start);
            setHistory([]);
            setDone(false);
          }}
        >
          Reset
        </button>
        {seed === undefined ? (
          <button
            type="button"
            className="mv-btn-ghost"
            onClick={() => {
              const next = fresh(Math.random);
              setStart(next);
              setCube(next);
              setHistory([]);
              setDone(false);
            }}
          >
            <Shuffle className="size-4" /> New scramble
          </button>
        ) : null}
        <span className="ml-auto text-xs text-mv-muted tabular-nums">{history.length} moves</span>
      </div>
      {done ? <Status tone="good">Solved in {history.length} moves.</Status> : null}
    </div>
  );
}
