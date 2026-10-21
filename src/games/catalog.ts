import type { ComponentType } from "react";
import { Box, Brain, Calculator, Grid3x3, ListOrdered, Shuffle, type LucideIcon } from "lucide-react";
import { MentalMath } from "./MentalMath.tsx";
import { NBack } from "./NBack.tsx";
import { PictureCube } from "./PictureCube.tsx";
import { SequenceMemory } from "./SequenceMemory.tsx";
import { SudokuGame } from "./SudokuGame.tsx";
import { WordScramble } from "./WordScramble.tsx";

export type Difficulty = "easy" | "medium" | "hard";
export type GameId = "sudoku" | "math" | "sequence" | "cube" | "nback" | "words";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export interface GameProps {
  difficulty: Difficulty;
  /** Set for the daily challenge so everyone gets the same puzzle all day. */
  seed?: number;
  onSolved: () => void;
}

export interface GameInfo {
  id: GameId;
  name: string;
  skill: string;
  blurb: string;
  icon: LucideIcon;
  tint: string;
  component: ComponentType<GameProps>;
}

export const GAMES: GameInfo[] = [
  {
    id: "sudoku",
    name: "Sudoku",
    skill: "Logic",
    blurb: "Fill every row, column, and box with 1 to 9.",
    icon: Grid3x3,
    tint: "from-violet-500 to-indigo-500",
    component: SudokuGame,
  },
  {
    id: "math",
    name: "Mental math",
    skill: "Arithmetic",
    blurb: "Quick sums, differences, and products in your head.",
    icon: Calculator,
    tint: "from-cyan-500 to-sky-500",
    component: MentalMath,
  },
  {
    id: "sequence",
    name: "Sequence memory",
    skill: "Short-term memory",
    blurb: "Watch the pads light up, then repeat the pattern.",
    icon: ListOrdered,
    tint: "from-emerald-500 to-teal-500",
    component: SequenceMemory,
  },
  {
    id: "nback",
    name: "N-back",
    skill: "Working memory",
    blurb: "Tap Match when a letter repeats from N steps back.",
    icon: Brain,
    tint: "from-fuchsia-500 to-pink-500",
    component: NBack,
  },
  {
    id: "words",
    name: "Word scramble",
    skill: "Vocabulary",
    blurb: "Unscramble the letters into a real word.",
    icon: Shuffle,
    tint: "from-amber-500 to-orange-500",
    component: WordScramble,
  },
  {
    id: "cube",
    name: "Picture cube",
    skill: "Spatial reasoning",
    blurb: "Turn the faces until each picture is whole again.",
    icon: Box,
    tint: "from-rose-500 to-red-500",
    component: PictureCube,
  },
];

export function gameById(id: GameId): GameInfo {
  return GAMES.find((game) => game.id === id) ?? GAMES[0];
}
