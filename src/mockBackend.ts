import { DEFAULT_ALLOW_HOSTS } from "./hostCatalog.ts";
import { allowsEmptyKey, FREE_TUTOR } from "./lib/endpoint.ts";
import { dayKey } from "./lib/rng.ts";
import type { AppView, Level, Schedule, TutorJob, TutorView } from "./types.ts";

const DENY = [
  "chatgpt.com",
  "openai.com",
  "claude.ai",
  "anthropic.com",
  "gemini.google.com",
  "copilot.microsoft.com",
  "githubcopilot.com",
  "cursor.com",
  "cursor.sh",
  "ollama.com",
  "lmstudio.ai",
  "youtube.com",
  "youtu.be",
  "netflix.com",
  "tiktok.com",
  "reddit.com",
  "steampowered.com",
  "steamcommunity.com",
  "twitch.tv",
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
];

interface MockState extends AppView {
  pin: string;
  recoveryKey: string;
  scheduleFired: string[];
}

const KEY = "mindvault-preview";

function blank(): MockState {
  return {
    enrolled: false,
    recoveryAcknowledged: false,
    hasApiKey: false,
    apiBase: FREE_TUTOR.base,
    model: FREE_TUTOR.model,
    allowHosts: DEFAULT_ALLOW_HOSTS.slice(),
    denyHosts: DENY.slice(),
    customBlocks: [],
    pendingSuggestion: null,
    session: null,
    schedules: [],
    practiceMode: true,
    pin: "",
    recoveryKey: "",
    scheduleFired: [],
  };
}

function load(): MockState {
  const raw = localStorage.getItem(KEY);
  if (!raw) return blank();
  const parsed = { ...blank(), ...(JSON.parse(raw) as Partial<MockState>) } as MockState;
  parsed.denyHosts = DENY.slice();
  parsed.practiceMode = true;
  if (parsed.session && new Date(parsed.session.endsAt).getTime() <= Date.now()) {
    parsed.session = null;
  }
  return parsed;
}

function save(state: MockState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function view(state: MockState): AppView {
  const { pin: _pin, recoveryKey: _key, scheduleFired: _fired, ...rest } = state;
  return rest;
}

function validateSchedules(list: Schedule[]): Schedule[] {
  if (list.length > 12) throw new Error("Keep it to 12 schedules or fewer.");
  const ids = new Set<string>();
  return list.map((item) => {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(item.id)) throw new Error("Each schedule needs a short id.");
    if (ids.has(item.id)) throw new Error("Schedule ids must be unique.");
    ids.add(item.id);
    const days = [...new Set(item.days)].sort();
    if (days.length === 0 || days.some((day) => day < 0 || day > 6)) {
      throw new Error("Pick at least one valid day for each schedule.");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start)) throw new Error("Schedule start times use HH:MM.");
    if (item.minutes < 1 || item.minutes > 480) throw new Error("A session can be from 1 minute up to 8 hours.");
    return { ...item, days };
  });
}

/** Mirrors schedule::due in Rust, including windows that cross midnight. */
function startScheduled(state: MockState): boolean {
  if (state.session || !state.enrolled || !state.recoveryAcknowledged) return false;
  const now = new Date();
  for (const item of state.schedules) {
    const [hours, minutes] = item.start.split(":").map(Number);
    for (const back of [0, 1]) {
      const begin = new Date(now);
      begin.setDate(begin.getDate() - back);
      begin.setHours(hours, minutes, 0, 0);
      const weekday = (begin.getDay() + 6) % 7;
      if (!item.days.includes(weekday)) continue;
      const end = new Date(begin.getTime() + item.minutes * 60_000);
      if (now < begin || now >= end) continue;
      const mark = `${item.id}@${dayKey(begin)}`;
      if (state.scheduleFired.includes(mark)) continue;
      state.scheduleFired = [...state.scheduleFired, mark].slice(-64);
      state.session = {
        level: item.level,
        startedAt: now.toISOString(),
        endsAt: end.toISOString(),
        blockCompleted: false,
        frozenAllow: state.allowHosts.slice(),
      };
      return true;
    }
  }
  return false;
}

function hostOf(url: string) {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, "").toLowerCase();
}

function denied(host: string) {
  return DENY.some((rule) => host === rule || host.endsWith(`.${rule}`));
}

function requirePin(state: MockState, pin: string) {
  if (!state.enrolled) throw new Error("Set up MindVault before doing that.");
  if (state.session) throw new Error("Change this before a session starts.");
  if (pin !== state.pin) throw new Error("Wrong PIN.");
}

export const preview = {
  getState(): AppView {
    const state = load();
    if (startScheduled(state)) save(state);
    return view(state);
  },
  setSchedules(pin: string, schedules: Schedule[]): AppView {
    const state = load();
    requirePin(state, pin);
    state.schedules = validateSchedules(schedules);
    save(state);
    return view(state);
  },
  enroll(pin: string): string {
    const state = load();
    if (state.enrolled) throw new Error("MindVault is already set up on this account.");
    if (pin.trim().length < 4) throw new Error("Use at least 4 characters for the PIN.");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const raw = Array.from({ length: 20 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    const recoveryKey = raw.match(/.{1,4}/g)?.join("-") ?? raw;
    state.enrolled = true;
    state.pin = pin;
    state.recoveryKey = recoveryKey;
    state.recoveryAcknowledged = false;
    save(state);
    return recoveryKey;
  },
  acknowledge(): AppView {
    const state = load();
    if (!state.enrolled) throw new Error("Set up MindVault before doing that.");
    state.recoveryAcknowledged = true;
    save(state);
    return view(state);
  },
  resetSetup(pin: string): AppView {
    const state = load();
    if (state.recoveryAcknowledged) {
      throw new Error("Setup is already saved. Use the recovery key during a session.");
    }
    if (pin !== state.pin) throw new Error("Wrong PIN.");
    const fresh = blank();
    save(fresh);
    return view(fresh);
  },
  setAllowlist(pin: string, hosts: string[]): AppView {
    const state = load();
    requirePin(state, pin);
    const clean: string[] = [];
    for (const host of hosts) {
      const normalized = host.trim().toLowerCase().replace(/^www\./, "");
      if (!normalized) continue;
      if (denied(normalized)) throw new Error(`${normalized} is on the denylist and cannot be added.`);
      if (!clean.includes(normalized)) clean.push(normalized);
    }
    state.allowHosts = clean;
    save(state);
    return view(state);
  },
  setApiConfig(pin: string, base: string, model: string): AppView {
    const state = load();
    requirePin(state, pin);
    if (!base.trim().startsWith("https:") && !allowsEmptyKey(base)) {
      throw new Error("Use https, or http only for localhost.");
    }
    state.apiBase = base.replace(/\/$/, "");
    state.model = model.trim();
    save(state);
    return view(state);
  },
  setApiKey(pin: string, key: string): AppView {
    const state = load();
    requirePin(state, pin);
    state.hasApiKey = key.trim().length > 0;
    save(state);
    return view(state);
  },
  startSession(level: Level, minutes: number, pin: string | null): AppView {
    const state = load();
    if (!state.enrolled || !state.recoveryAcknowledged) {
      throw new Error("Save the recovery key before starting a session.");
    }
    if (minutes < 1 || minutes > 480) throw new Error("A session can be from 1 minute up to 8 hours.");
    if (state.session) throw new Error("A session is already running.");
    if (level !== "light") {
      if (!pin) throw new Error("Set a PIN before starting a Standard or Full session.");
      if (pin !== state.pin) throw new Error("Wrong PIN.");
    }
    const start = new Date();
    const end = new Date(start.getTime() + minutes * 60_000);
    state.session = {
      level,
      startedAt: start.toISOString(),
      endsAt: end.toISOString(),
      blockCompleted: false,
      frozenAllow: state.allowHosts.slice(),
    };
    save(state);
    return view(state);
  },
  poll(): AppView {
    return preview.getState();
  },
  completeBlock(): AppView {
    const state = load();
    if (!state.session) throw new Error("No session is running.");
    state.session.blockCompleted = true;
    save(state);
    return view(state);
  },
  endEarly(): AppView {
    const state = load();
    if (!state.session?.blockCompleted) {
      throw new Error("Finish a quiz or a skill game, or enter the recovery key.");
    }
    state.session = null;
    save(state);
    return view(state);
  },
  endLight(pin: string): AppView {
    const state = load();
    if (state.session?.level !== "light") {
      throw new Error("Finish a quiz or a skill game, or enter the recovery key.");
    }
    if (pin !== state.pin) throw new Error("Wrong PIN.");
    state.session = null;
    save(state);
    return view(state);
  },
  endWithRecovery(key: string): AppView {
    const state = load();
    if (!state.session) throw new Error("No session is running.");
    if (key.trim() !== state.recoveryKey) throw new Error("Enter the recovery key from setup.");
    state.session = null;
    save(state);
    return view(state);
  },
  openStudy(url: string) {
    const state = load();
    if (!state.session) throw new Error("No session is running.");
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Only https study pages on your allowlist can open.");
    const host = hostOf(url);
    if (denied(host)) throw new Error("That site stays blocked.");
    const allowed = state.session.frozenAllow.some((rule) => host === rule || host.endsWith(`.${rule}`));
    if (!allowed) throw new Error("Only https study pages on your allowlist can open.");
    window.open(url, "_blank", "noopener");
  },
  tutor(job: TutorJob): TutorView {
    if ("prompt" in job || "messages" in job) throw new Error("That request is not a study action.");
    const state = load();
    if (!state.session) throw new Error("The tutor is available during a session.");
    if (!state.hasApiKey && !allowsEmptyKey(state.apiBase)) {
      throw new Error("Choose a tutor from the list, or save an API key. Reading and the skill games still work.");
    }
    if (job.job === "grade") {
      return {
        summary: null,
        questions: [],
        cards: [],
        grade: { correct: job.answer.trim().length > 0, explanation: "Preview grade. The desktop app calls your API." },
        gaps: [],
        followUp: null,
      };
    }
    if (job.job === "flashcards") {
      return {
        summary: null,
        questions: [],
        cards: [
          { front: "What should you do first?", back: "Attempt the question before reading the answer." },
          { front: "Where does the summary stay?", back: "Hidden until a quiz answer is in." },
        ],
        grade: null,
        gaps: [],
        followUp: null,
      };
    }
    if (job.job === "explainBack") {
      return {
        summary: null,
        questions: [],
        cards: [],
        grade: null,
        gaps: ["Name the mechanism, not only the result."],
        followUp: "What would change if that cause were removed?",
      };
    }
    return {
      summary: job.job === "summarizeThenQuiz" ? "Preview summary of your source. It stays hidden until you answer." : null,
      questions: [
        {
          prompt: "Which habit keeps the work in your head?",
          choices: ["Asking a model to finish it", "Answering before the summary is shown", "Opening a chat window"],
          answerIndex: 1,
        },
      ],
      cards: [],
      grade: null,
      gaps: [],
      followUp: null,
    };
  },
  classify(imageName: string): AppView {
    const state = load();
    if (state.session) throw new Error("Classify programs before a session starts.");
    if (!state.hasApiKey && !allowsEmptyKey(state.apiBase)) {
      throw new Error("Choose a tutor from the list, or save an API key. Reading and the skill games still work.");
    }
    const image = imageName.trim().toLowerCase();
    if (!image.endsWith(".exe") || image === "taskmgr.exe" || image === "explorer.exe") {
      throw new Error("That program cannot be blocked.");
    }
    state.pendingSuggestion = {
      imageName: image,
      category: "ai_tool",
      reason: "Preview classification. The desktop app asks your API.",
    };
    save(state);
    return view(state);
  },
  accept(pin: string): AppView {
    const state = load();
    requirePin(state, pin);
    if (!state.pendingSuggestion || state.pendingSuggestion.category === "allowed") {
      throw new Error("That program was classified as allowed.");
    }
    if (!state.customBlocks.includes(state.pendingSuggestion.imageName)) {
      state.customBlocks.push(state.pendingSuggestion.imageName);
    }
    state.pendingSuggestion = null;
    save(state);
    return view(state);
  },
  dismiss(pin: string): AppView {
    const state = load();
    requirePin(state, pin);
    state.pendingSuggestion = null;
    save(state);
    return view(state);
  },
};
