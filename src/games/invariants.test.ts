import assert from "node:assert/strict";
import test from "node:test";
import { seeded } from "../lib/rng.ts";
import { streak, type Stats } from "../lib/stats.ts";
import { isSolved, MOVES, sameCube, scramble, solvedCube, turn } from "./cube.ts";
import { createSudoku, isValidSudoku } from "./sudoku.ts";
import { scramble as scrambleWord, WORDS } from "./words.ts";

test("seeded sudoku is the same puzzle for the same seed and respects difficulty", () => {
  const first = createSudoku(54, seeded(42));
  const second = createSudoku(54, seeded(42));
  assert.deepEqual(first.puzzle, second.puzzle);
  assert.equal(isValidSudoku(first.solution), true);
  assert.equal(first.puzzle.flat().filter((value) => value === 0).length, 54);
});

test("cube scramble depth is respected and never returns a solved cube", () => {
  for (const depth of [1, 3, 6, 12]) {
    assert.equal(isSolved(scramble(solvedCube(), depth, seeded(depth))), false);
  }
});

test("word scramble always changes the word and keeps its letters", () => {
  for (const word of WORDS.medium) {
    const mixed = scrambleWord(word, seeded(word.length));
    assert.notEqual(mixed, word);
    assert.equal(mixed.split("").sort().join(""), word.split("").sort().join(""));
  }
});

test("streak counts back from today, or from yesterday before today's activity", () => {
  const day = { focusMinutes: 10, sessions: 1, solves: 0, daily: false };
  const stats: Stats = { days: { "2026-10-19": day, "2026-10-20": day }, solvesByGame: {}, bestStreak: 0 };
  assert.equal(streak(stats, new Date(2026, 9, 21)), 2);
  assert.equal(streak({ ...stats, days: { ...stats.days, "2026-10-21": day } }, new Date(2026, 9, 21)), 3);
  assert.equal(streak(stats, new Date(2026, 9, 23)), 0);
});

test("cube moves conserve stickers and return after four turns", () => {
  const solved = solvedCube();
  assert.equal(isSolved(solved), true);
  for (const move of MOVES) {
    let cube = solved;
    for (let step = 0; step < 4; step += 1) cube = turn(cube, move);
    assert.equal(sameCube(cube, solved), true, move);
    const ids = turn(solved, move).flat().sort((a, b) => a - b);
    assert.deepEqual(ids, Array.from({ length: 54 }, (_, index) => index));
  }
});

test("sudoku deals a valid solution and a partial puzzle", () => {
  const { puzzle, solution } = createSudoku();
  assert.equal(isValidSudoku(solution), true);
  assert.equal(isValidSudoku(puzzle), false);
  const givens = puzzle.flat().filter((value) => value !== 0).length;
  assert.equal(givens, 36);
  puzzle.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (value !== 0) assert.equal(value, solution[rowIndex][colIndex]);
    });
  });
});
