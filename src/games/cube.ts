export type Face = number[];
export type Cube = Face[];

export const FACE_NAMES = ["U", "D", "F", "B", "L", "R"] as const;
export type Move = "U" | "U'" | "D" | "D'" | "F" | "F'" | "B" | "B'" | "L" | "L'" | "R" | "R'";

export const MOVES: Move[] = ["U", "U'", "D", "D'", "F", "F'", "B", "B'", "L", "L'", "R", "R'"];

function face(id: number): Face {
  return Array.from({ length: 9 }, (_, index) => id * 9 + index);
}

export function solvedCube(): Cube {
  return [0, 1, 2, 3, 4, 5].map(face);
}

function turnFace(stickers: Face): Face {
  const next = stickers.slice();
  next[0] = stickers[6];
  next[1] = stickers[3];
  next[2] = stickers[0];
  next[3] = stickers[7];
  next[5] = stickers[1];
  next[6] = stickers[8];
  next[7] = stickers[5];
  next[8] = stickers[2];
  return next;
}

function setRow(faceStickers: Face, indexes: number[], values: number[]): Face {
  const next = faceStickers.slice();
  indexes.forEach((index, offset) => {
    next[index] = values[offset];
  });
  return next;
}

function take(faceStickers: Face, indexes: number[]): number[] {
  return indexes.map((index) => faceStickers[index]);
}

export function turn(cube: Cube, move: Move): Cube {
  const next = cube.map((faceStickers) => faceStickers.slice());
  const clockwise = !move.endsWith("'");
  const faceName = move[0];
  const times = clockwise ? 1 : 3;
  for (let step = 0; step < times; step += 1) {
    applyClockwise(next, faceName);
  }
  return next;
}

function applyClockwise(cube: Cube, faceName: string) {
  if (faceName === "U") {
    cube[0] = turnFace(cube[0]);
    const front = take(cube[2], [0, 1, 2]);
    const right = take(cube[5], [0, 1, 2]);
    const back = take(cube[3], [0, 1, 2]);
    const left = take(cube[4], [0, 1, 2]);
    cube[5] = setRow(cube[5], [0, 1, 2], front);
    cube[3] = setRow(cube[3], [0, 1, 2], right);
    cube[4] = setRow(cube[4], [0, 1, 2], back);
    cube[2] = setRow(cube[2], [0, 1, 2], left);
  } else if (faceName === "D") {
    cube[1] = turnFace(cube[1]);
    const front = take(cube[2], [6, 7, 8]);
    const left = take(cube[4], [6, 7, 8]);
    const back = take(cube[3], [6, 7, 8]);
    const right = take(cube[5], [6, 7, 8]);
    cube[4] = setRow(cube[4], [6, 7, 8], front);
    cube[3] = setRow(cube[3], [6, 7, 8], left);
    cube[5] = setRow(cube[5], [6, 7, 8], back);
    cube[2] = setRow(cube[2], [6, 7, 8], right);
  } else if (faceName === "F") {
    cube[2] = turnFace(cube[2]);
    const up = take(cube[0], [6, 7, 8]);
    const right = take(cube[5], [0, 3, 6]);
    const down = take(cube[1], [2, 1, 0]);
    const left = take(cube[4], [8, 5, 2]);
    cube[5] = setRow(cube[5], [0, 3, 6], up);
    cube[1] = setRow(cube[1], [2, 1, 0], right);
    cube[4] = setRow(cube[4], [8, 5, 2], down);
    cube[0] = setRow(cube[0], [6, 7, 8], left);
  } else if (faceName === "B") {
    cube[3] = turnFace(cube[3]);
    const up = take(cube[0], [2, 1, 0]);
    const left = take(cube[4], [0, 3, 6]);
    const down = take(cube[1], [6, 7, 8]);
    const right = take(cube[5], [8, 5, 2]);
    cube[4] = setRow(cube[4], [0, 3, 6], up);
    cube[1] = setRow(cube[1], [6, 7, 8], left);
    cube[5] = setRow(cube[5], [8, 5, 2], down);
    cube[0] = setRow(cube[0], [2, 1, 0], right);
  } else if (faceName === "L") {
    cube[4] = turnFace(cube[4]);
    const up = take(cube[0], [0, 3, 6]);
    const front = take(cube[2], [0, 3, 6]);
    const down = take(cube[1], [0, 3, 6]);
    const back = take(cube[3], [8, 5, 2]);
    cube[2] = setRow(cube[2], [0, 3, 6], up);
    cube[1] = setRow(cube[1], [0, 3, 6], front);
    cube[3] = setRow(cube[3], [8, 5, 2], down);
    cube[0] = setRow(cube[0], [0, 3, 6], back);
  } else if (faceName === "R") {
    cube[5] = turnFace(cube[5]);
    const up = take(cube[0], [8, 5, 2]);
    const back = take(cube[3], [0, 3, 6]);
    const down = take(cube[1], [8, 5, 2]);
    const front = take(cube[2], [8, 5, 2]);
    cube[3] = setRow(cube[3], [0, 3, 6], up);
    cube[1] = setRow(cube[1], [8, 5, 2], back);
    cube[2] = setRow(cube[2], [8, 5, 2], down);
    cube[0] = setRow(cube[0], [8, 5, 2], front);
  }
}

export function isSolved(cube: Cube): boolean {
  return cube.every((faceStickers, faceIndex) =>
    faceStickers.every((sticker, index) => sticker === faceIndex * 9 + index),
  );
}

function inverse(move: Move): Move {
  return (move.endsWith("'") ? move[0] : `${move}'`) as Move;
}

/** Random turns that never immediately undo the previous one. */
export function scramble(cube: Cube, depth = 24, rng: () => number = Math.random): Cube {
  let next = cube;
  let last: Move | null = null;
  for (let step = 0; step < depth; step += 1) {
    const options = MOVES.filter((move) => last === null || move !== inverse(last));
    const move = options[Math.floor(rng() * options.length)];
    next = turn(next, move);
    last = move;
  }
  return isSolved(next) ? turn(next, "U") : next;
}

export function sameCube(left: Cube, right: Cube): boolean {
  return left.every((faceStickers, faceIndex) =>
    faceStickers.every((sticker, index) => sticker === right[faceIndex][index]),
  );
}
