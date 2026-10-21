// Keep this list in sync with src-tauri/src/policy.rs DEFAULT_ALLOW.
// Study sites: reading and courses. Game sites: online puzzles that train
// logic, memory, or calculation with no feed, chat, or social layer.
export const STUDY_HOSTS = [
  "wikipedia.org",
  "khanacademy.org",
  "coursera.org",
  "edx.org",
  "arxiv.org",
  "scholar.google.com",
  "brilliant.org",
  "projecteuler.net",
  "leetcode.com",
];

export const GAME_HOSTS = [
  "lichess.org",
  "chess.com",
  "sudoku.com",
  "play2048.co",
  "puzzlebaron.com",
  "jigsawplanet.com",
];

export const DEFAULT_ALLOW_HOSTS = [...STUDY_HOSTS, ...GAME_HOSTS];

export type HostKind = "study" | "game";

function normalize(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

export function hostKind(host: string): HostKind {
  const normalized = normalize(host);
  const isGame = GAME_HOSTS.some((rule) => normalized === rule || normalized.endsWith(`.${rule}`));
  return isGame ? "game" : "study";
}
