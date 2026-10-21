import { BarChart3, BookOpen, Flame, Gamepad2, House, Lock, Settings } from "lucide-react";
import type { Theme } from "../theme.ts";
import type { SessionRow } from "../types.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { formatClock } from "./TimerRing.tsx";

export type Page = "home" | "focus" | "games" | "stats" | "settings";

const ITEMS: { id: Page; label: string; icon: typeof House }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "focus", label: "Study desk", icon: BookOpen },
  { id: "games", label: "Brain games", icon: Gamepad2 },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  page,
  onPage,
  session,
  remaining,
  streak,
  theme,
  onTheme,
}: {
  page: Page;
  onPage: (page: Page) => void;
  session: SessionRow | null;
  remaining: number;
  streak: number;
  theme: Theme;
  onTheme: () => void;
}) {
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-6 border-r border-mv-line bg-mv-card/60 p-4 backdrop-blur-2xl">
      <div className="flex items-center gap-3 px-2 pt-2">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#0891b2] text-white shadow-lg shadow-violet-600/30">
          <Lock className="size-5" />
        </div>
        <div>
          <p className="font-display text-lg leading-tight font-bold tracking-tight">MindVault</p>
          <p className="text-xs text-mv-muted">Think for yourself</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "mv-nav-on" : "mv-nav"}
              onClick={() => onPage(item.id)}
              aria-current={page === item.id ? "page" : undefined}
            >
              <Icon className={`size-[1.1rem] ${page === item.id ? "text-mv-accent" : ""}`} />
              {item.label}
              {item.id === "focus" && session ? (
                <span className="ml-auto size-2 animate-pulse rounded-full bg-mv-good" aria-label="Session running" />
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {session ? (
          <button
            type="button"
            onClick={() => onPage("home")}
            className="cursor-pointer rounded-2xl border border-mv-accent/30 bg-gradient-to-br from-mv-accent/15 to-mv-accent-2/10 p-3 text-left"
          >
            <p className="mv-label">{session.level} lock</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{formatClock(remaining)}</p>
          </button>
        ) : null}
        <div className="flex items-center justify-between rounded-2xl border border-mv-line bg-mv-field p-3">
          <div className="flex items-center gap-2">
            <Flame className={`size-5 ${streak > 0 ? "text-orange-500" : "text-mv-muted"}`} />
            <div>
              <p className="text-sm leading-tight font-semibold">{streak} day streak</p>
              <p className="text-xs text-mv-muted">{streak > 0 ? "Keep it going" : "Start one today"}</p>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={onTheme} />
        </div>
      </div>
    </aside>
  );
}
