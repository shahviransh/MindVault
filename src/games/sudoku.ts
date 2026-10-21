import { shuffle, type Rng } from "../lib/rng.ts";

export type Grid = number[][];

const BASE: Grid = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [4, 5, 6, 7, 8, 9, 1, 2, 3],
  [7, 8, 9, 1, 2, 3, 4, 5, 6],
  [2, 3, 1, 5, 6, 4, 8, 9, 7],
  [5, 6, 4, 8, 9, 7, 2, 3, 1],
  [8, 9, 7, 2, 3, 1, 5, 6, 4],
  [3, 1, 2, 6, 4, 5, 9, 7, 8],
  [6, 4, 5, 9, 7, 8, 3, 1, 2],
  [9, 7, 8, 3, 1, 2, 6, 4, 5],
];

function clone(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}


export function isValidSudoku(grid: Grid): boolean {
  if (grid.length !== 9 || grid.some((row) => row.length !== 9)) return false;
  const seen = (values: number[]) => {
    const filled = values.filter((value) => value !== 0);
    return new Set(filled).size === filled.length && filled.every((value) => value >= 1 && value <= 9);
  };
  for (let index = 0; index < 9; index += 1) {
    if (!seen(grid[index])) return false;
    if (!seen(grid.map((row) => row[index]))) return false;
  }
  for (let boxRow = 0; boxRow < 9; boxRow += 3) {
    for (let boxCol = 0; boxCol < 9; boxCol += 3) {
      const values: number[] = [];
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          values.push(grid[boxRow + row][boxCol + col]);
        }
      }
      if (!seen(values)) return false;
    }
  }
  return grid.every((row) => row.every((value) => value >= 1 && value <= 9));
}

export function createSudoku(holeCount = 45, rng: Rng = Math.random): { puzzle: Grid; solution: Grid } {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  let solution = clone(BASE).map((row) => row.map((value) => digits[value - 1]));
  const band = shuffle([0, 1, 2], rng);
  const rows = band.flatMap((group) => shuffle([0, 1, 2], rng).map((offset) => group * 3 + offset));
  solution = rows.map((row) => solution[row]);
  const stack = shuffle([0, 1, 2], rng);
  const cols = stack.flatMap((group) => shuffle([0, 1, 2], rng).map((offset) => group * 3 + offset));
  solution = solution.map((row) => cols.map((col) => row[col]));
  const puzzle = clone(solution);
  const holes = shuffle(
    Array.from({ length: 81 }, (_, index) => index),
    rng,
  ).slice(0, holeCount);
  for (const hole of holes) {
    puzzle[Math.floor(hole / 9)][hole % 9] = 0;
  }
  return { puzzle, solution };
}
