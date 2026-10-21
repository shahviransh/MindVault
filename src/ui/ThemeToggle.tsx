import { Moon, Sun } from "lucide-react";
import type { Theme } from "../theme.ts";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="mv-icon-btn"
      onClick={onToggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <Sun className="size-[1.1rem]" /> : <Moon className="size-[1.1rem]" />}
    </button>
  );
}
