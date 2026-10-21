import { Eraser, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { seeded } from "../lib/rng.ts";
import type { GameProps } from "./catalog.ts";
import { Status } from "./Status.tsx";
import { createSudoku, isValidSudoku, type Grid } from "./sudoku.ts";

const HOLES = { easy: 36, medium: 46, hard: 54 };

function conflicts(grid: Grid): Set<string> {
  const bad = new Set<string>();
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const value = grid[row][col];
      if (value === 0) continue;
      for (let index = 0; index < 9; index += 1) {
        const boxRow = Math.floor(row / 3) * 3 + Math.floor(index / 3);
        const boxCol = Math.floor(col / 3) * 3 + (index % 3);
        if (
          (index !== col && grid[row][index] === value) ||
          (index !== row && grid[index][col] === value) ||
          ((boxRow !== row || boxCol !== col) && grid[boxRow][boxCol] === value)
        ) {
          bad.add(`${row}-${col}`);
        }
      }
    }
  }
  return bad;
}

export function SudokuGame({ difficulty, seed, onSolved }: GameProps) {
  const [deal, setDeal] = useState(() =>
    createSudoku(HOLES[difficulty], seed === undefined ? Math.random : seeded(seed)),
  );
  const [grid, setGrid] = useState<Grid>(() => deal.puzzle.map((row) => row.slice()));
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "good" | "bad"; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const givens = useMemo(() => deal.puzzle.map((row) => row.map((value) => value !== 0)), [deal]);
  const bad = useMemo(() => conflicts(grid), [grid]);
  const filled = grid.flat().filter((value) => value !== 0).length;

  function setCell(row: number, col: number, value: number) {
    if (givens[row][col] || done) return;
    setGrid((current) =>
      current.map((line, r) => line.map((cell, c) => (r === row && c === col ? value : cell))),
    );
    setMessage(null);
  }

  function check() {
    if (!isValidSudoku(grid)) {
      setMessage({
        tone: "bad",
        text: filled < 81 ? `${81 - filled} cells left to fill.` : "Some digits clash. Look for the red cells.",
      });
      return;
    }
    setDone(true);
    setMessage({ tone: "good", text: "Solved. Nicely reasoned." });
    onSolved();
  }

  function redeal() {
    const next = createSudoku(HOLES[difficulty], Math.random);
    setDeal(next);
    setGrid(next.puzzle.map((row) => row.slice()));
    setMessage(null);
    setDone(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="mv-sudoku rounded-2xl border border-mv-line bg-mv-solid/50 p-2" role="grid">
          {grid.map((row, r) =>
            row.map((value, c) => {
              const key = `${r}-${c}`;
              const related =
                focus !== null &&
                (focus[0] === r ||
                  focus[1] === c ||
                  (Math.floor(focus[0] / 3) === Math.floor(r / 3) && Math.floor(focus[1] / 3) === Math.floor(c / 3)));
              const same = focus !== null && value !== 0 && grid[focus[0]][focus[1]] === value;
              return (
                <input
                  key={key}
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`Row ${r + 1} column ${c + 1}`}
                  className={[
                    "mv-sudoku-cell",
                    givens[r][c] ? "font-bold text-mv-ink" : "font-medium text-mv-accent",
                    related ? "bg-mv-accent/8" : "",
                    same ? "bg-mv-accent/20" : "",
                    bad.has(key) && !givens[r][c] ? "border-mv-bad bg-mv-bad/10 text-mv-bad" : "",
                    c % 3 === 2 && c !== 8 ? "mr-1.5" : "",
                    r % 3 === 2 && r !== 8 ? "mb-1.5" : "",
                  ].join(" ")}
                  value={value === 0 ? "" : String(value)}
                  readOnly={givens[r][c] || done}
                  onFocus={() => setFocus([r, c])}
                  onChange={(event) => {
                    const digit = event.target.value.replace(/[^1-9]/g, "").slice(-1);
                    setCell(r, c, digit === "" ? 0 : Number(digit));
                  }}
                />
              );
            }),
          )}
        </div>
        <div className="flex min-w-44 flex-col gap-3">
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                type="button"
                className="mv-btn-ghost size-12 p-0 text-base"
                disabled={!focus || done}
                onClick={() => focus && setCell(focus[0], focus[1], digit)}
              >
                {digit}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mv-btn-ghost"
            disabled={!focus || done}
            onClick={() => focus && setCell(focus[0], focus[1], 0)}
          >
            <Eraser className="size-4" /> Erase
          </button>
          <button type="button" className="mv-btn" onClick={check} disabled={done}>
            Check board
          </button>
          {seed === undefined ? (
            <button type="button" className="mv-btn-ghost" onClick={redeal}>
              <RotateCcw className="size-4" /> New puzzle
            </button>
          ) : null}
          <p className="text-xs text-mv-muted">{filled}/81 filled</p>
        </div>
      </div>
      {message ? <Status tone={message.tone}>{message.text}</Status> : null}
    </div>
  );
}
