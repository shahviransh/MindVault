export type Level = "light" | "standard" | "full";

export interface Suggestion {
  imageName: string;
  category: string;
  reason: string;
}

export interface SessionRow {
  level: Level;
  startedAt: string;
  endsAt: string;
  blockCompleted: boolean;
  frozenAllow: string[];
  noteFiles: string[];
}

export interface Schedule {
  id: string;
  /** 0 = Monday through 6 = Sunday. */
  days: number[];
  /** Local start time, "HH:MM". */
  start: string;
  minutes: number;
  level: Level;
}

export interface LocalTutorStatus {
  id: string;
  running: boolean;
  model: string;
}

export interface AppView {
  enrolled: boolean;
  recoveryAcknowledged: boolean;
  hasApiKey: boolean;
  apiBase: string;
  model: string;
  allowHosts: string[];
  denyHosts: string[];
  customBlocks: string[];
  entertainmentHosts: string[];
  entertainmentPrograms: string[];
  noteFiles: string[];
  pendingSuggestion: Suggestion | null;
  session: SessionRow | null;
  schedules: Schedule[];
  practiceMode: boolean;
}

export interface Question {
  prompt: string;
  choices: string[];
  answerIndex: number;
}

export interface Card {
  front: string;
  back: string;
}

export interface Grade {
  correct: boolean;
  explanation: string;
}

export interface TutorView {
  summary: string | null;
  questions: Question[];
  cards: Card[];
  grade: Grade | null;
  gaps: string[];
  followUp: string | null;
}

export type TutorJob =
  | { job: "quiz"; source: string }
  | { job: "summarizeThenQuiz"; source: string }
  | { job: "flashcards"; source: string }
  | { job: "grade"; question: string; answer: string }
  | { job: "explainBack"; source: string; explanation: string };
