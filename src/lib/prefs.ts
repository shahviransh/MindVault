import type { Difficulty } from "../games/catalog.ts";
import { localStore } from "./localStore.ts";

export interface Prefs {
  difficulty: Difficulty;
  pomodoro: boolean;
  focusMinutes: number;
  breakMinutes: number;
  onboarded: boolean;
}

export const prefsStore = localStore<Prefs>("mindvault-prefs", {
  difficulty: "medium",
  pomodoro: true,
  focusMinutes: 25,
  breakMinutes: 5,
  onboarded: false,
});
