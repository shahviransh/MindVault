import type { Difficulty } from "./catalog.ts";
import { shuffle, type Rng } from "../lib/rng.ts";

export const WORDS: Record<Difficulty, string[]> = {
  easy: [
    "brain", "focus", "logic", "think", "smart", "learn", "quiet", "chess", "maths", "story",
    "light", "clear", "spark", "pulse", "solve", "notes", "ideas", "habit", "plant", "ocean",
    "river", "cloud", "piano", "tiger", "lemon", "dream", "trail", "stone", "flame", "honey",
  ],
  medium: [
    "puzzle", "memory", "reason", "riddle", "wisdom", "insight", "lantern", "student", "teacher", "journal",
    "library", "compass", "pattern", "balance", "curious", "problem", "thought", "rhythm", "circuit", "chapter",
    "glacier", "harvest", "picture", "science", "theorem", "voyager", "kingdom", "meadow", "anchor", "fortune",
  ],
  hard: [
    "attention", "knowledge", "discipline", "hypothesis", "curiosity", "deduction", "algorithm", "philosophy",
    "vocabulary", "creativity", "mindfulness", "laboratory", "microscope", "telescope", "geography", "archive",
    "democracy", "chemistry", "framework", "lighthouse", "navigation", "perception", "reflection", "strategy",
    "symphony", "universe", "monument", "equation", "parliament", "astronomy",
  ],
};

export function scramble(word: string, rng: Rng): string {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const mixed = shuffle(word.split(""), rng).join("");
    if (mixed !== word) return mixed;
  }
  return word.split("").reverse().join("");
}
