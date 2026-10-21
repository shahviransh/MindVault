import { GAMES, type Difficulty } from "../games/catalog.ts";
import { dayKey, daySeed } from "./rng.ts";

export function dailyChallenge(key = dayKey()) {
  const seed = daySeed(key);
  const game = GAMES[seed % GAMES.length];
  const difficulty: Difficulty = "medium";
  return { key, seed, game, difficulty };
}
