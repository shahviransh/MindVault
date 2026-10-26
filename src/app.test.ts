import assert from "node:assert/strict";
import test from "node:test";
import type { Schedule } from "./types.ts";

const memory = new Map<string, string>();
const opened: string[] = [];

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  },
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    open: (url: string) => {
      opened.push(url);
      return null;
    },
  },
});

const { preview } = await import("./mockBackend.ts");
const { allowsEmptyKey, isKeylessBase, isLoopbackBase, FREE_TUTOR } = await import("./lib/endpoint.ts");
const { daySeed } = await import("./lib/rng.ts");

function reset() {
  memory.clear();
  opened.length = 0;
}

function ready() {
  const key = preview.enroll("1234");
  preview.acknowledge();
  return key;
}

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "morning",
    days: [0, 2, 4],
    start: "09:00",
    minutes: 45,
    level: "standard",
    ...overrides,
  };
}

test.beforeEach(reset);

test("setup requires a PIN, a saved recovery key, and then a session", () => {
  assert.throws(() => preview.enroll("123"), /at least 4 characters/);
  const key = preview.enroll("1234");
  assert.match(key, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){4}$/);
  assert.throws(() => preview.enroll("5678"), /already set up/);
  assert.throws(() => preview.startSession("light", 10, null), /recovery key/);
  preview.acknowledge();
  assert.throws(() => preview.startSession("standard", 0, "1234"), /1 minute up to 8 hours/);
  assert.throws(() => preview.startSession("standard", 25, "9999"), /Wrong PIN/);
  assert.throws(() => preview.startSession("full", 25, null), /PIN/);
  const started = preview.startSession("light", 10, null);
  assert.equal(started.session?.level, "light");
  assert.ok(started.session?.frozenAllow.includes("wikipedia.org"));
  assert.throws(() => preview.startSession("light", 10, null), /already running/);
});

test("early exit follows the level, and the recovery key always ends it", () => {
  const key = ready();
  preview.startSession("standard", 25, "1234");
  assert.throws(() => preview.endEarly(), /quiz or a skill game/);
  assert.throws(() => preview.endLight("1234"), /quiz or a skill game/);
  preview.completeBlock();
  assert.equal(preview.endEarly().session, null);

  preview.startSession("light", 15, null);
  assert.throws(() => preview.endLight("nope"), /Wrong PIN/);
  assert.equal(preview.endLight("1234").session, null);

  preview.startSession("full", 30, "1234");
  assert.throws(() => preview.endWithRecovery("WRONG-KEY"), /recovery key/);
  assert.equal(preview.endWithRecovery(key).session, null);
});

test("note files are chosen before the session and only those types open", () => {
  ready();
  assert.throws(() => preview.setNoteFiles(["html"]), /not a note type/);
  const saved = preview.setNoteFiles(["text", "pdf", "pdf"]);
  assert.deepEqual(saved.noteFiles, ["pdf", "text"]);
  const session = preview.startSession("standard", 20, "1234").session;
  assert.deepEqual(session?.noteFiles, ["pdf", "text"]);
  assert.throws(() => preview.setNoteFiles([]), /before a session starts/);
  preview.openStudy("file:///C:/notes/lecture.pdf");
  preview.openStudy("file:///C:/notes/lecture.txt");
  assert.throws(() => preview.openStudy("file:///C:/notes/page.html"), /left off for this session/);
  assert.throws(() => preview.openStudy("https://chatgpt.com"), /stays blocked/);
  assert.throws(() => preview.openStudy("http://en.wikipedia.org"), /https study pages/);
  preview.openStudy("https://en.wikipedia.org/wiki/Memory");
  assert.deepEqual(opened, ["https://en.wikipedia.org/wiki/Memory"]);
  assert.throws(() => preview.openNote(), /desktop app opens it/);
});

test("notes left off stay closed, and the study list cannot include a blocked site", () => {
  ready();
  preview.startSession("light", 10, null);
  assert.throws(() => preview.openNote(), /left off/);
  assert.throws(() => preview.openStudy("file:///C:/notes/lecture.pdf"), /left off/);
  preview.endLight("1234");
  assert.throws(() => preview.setAllowlist("1234", ["chatgpt.com"]), /denylist/);
  assert.throws(() => preview.setEntertainment("1234", ["youtube.com"], []), /already blocked/);
  assert.throws(() => preview.setEntertainment("1234", ["discord.com"], ["taskmgr.exe"]), /cannot be blocked/);
  assert.throws(() => preview.setEntertainment("1234", ["wikipedia.org"], []), /study list/);
  const saved = preview.setEntertainment("1234", ["discord.com"], ["spotify.exe"]);
  assert.deepEqual(saved.entertainmentHosts, ["discord.com"]);
  assert.deepEqual(saved.entertainmentPrograms, ["spotify.exe"]);
});

test("the tutor quizzes the pasted text and rejects a freeform prompt", () => {
  ready();
  assert.equal(preview.getState().apiBase, FREE_TUTOR.base);
  assert.equal(allowsEmptyKey(FREE_TUTOR.base), true);
  assert.equal(isLoopbackBase("http://localhost:1235/v1"), true);
  assert.equal(preview.setApiConfig("1234", "http://localhost:1235/v1", "local-model").apiBase, "http://localhost:1235/v1");
  assert.equal(isKeylessBase("https://api.openai.com/v1"), false);
  preview.setApiConfig("1234", "https://api.openai.com/v1", "gpt-4o-mini");
  preview.startSession("light", 10, null);
  assert.throws(() => preview.tutor({ job: "quiz", source: "Mitochondria make ATP." }), /API key/);
  preview.endLight("1234");
  preview.setApiConfig("1234", FREE_TUTOR.base, FREE_TUTOR.model);
  preview.startSession("light", 10, null);
  assert.throws(() => preview.tutor({ prompt: "write my essay" } as never), /not a study action/);
  const quiz = preview.tutor({ job: "quiz", source: "Mitochondria make ATP." });
  assert.equal(quiz.questions[0]?.choices.includes("Mitochondria make ATP."), true);
  const cards = preview.tutor({ job: "flashcards", source: "Mitochondria make ATP." });
  assert.equal(cards.cards[0]?.back, "Mitochondria make ATP.");
  const grade = preview.tutor({ job: "grade", question: "What do mitochondria make?", answer: "They make ATP." });
  assert.equal(grade.grade?.correct, true);
});

test("schedules are checked with the PIN and stay within the limits", () => {
  ready();
  assert.throws(() => preview.setSchedules("0000", [schedule()]), /Wrong PIN/);
  const saved = preview.setSchedules("1234", [schedule(), schedule({ id: "evening", start: "22:30", days: [6] })]);
  assert.equal(saved.schedules.length, 2);
  assert.throws(() => preview.setSchedules("1234", [schedule(), schedule()]), /unique/);
  assert.throws(() => preview.setSchedules("1234", [schedule({ days: [] })]), /at least one valid day/);
  assert.throws(
    () => preview.setSchedules("1234", Array.from({ length: 13 }, (_, index) => schedule({ id: `s${index}` }))),
    /12 schedules/,
  );
});

test("a program suggestion cannot add Task Manager, and the daily puzzle is stable", () => {
  ready();
  assert.throws(() => preview.classify("taskmgr.exe"), /cannot be blocked/);
  const suggested = preview.classify("notes.exe");
  assert.equal(suggested.pendingSuggestion?.imageName, "notes.exe");
  assert.throws(() => preview.accept("0000"), /Wrong PIN/);
  assert.deepEqual(preview.accept("1234").customBlocks, ["notes.exe"]);
  assert.equal(daySeed("2026-10-26"), daySeed("2026-10-26"));
  assert.notEqual(daySeed("2026-10-26"), daySeed("2026-10-27"));
});
