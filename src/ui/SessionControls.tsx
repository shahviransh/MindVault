import { DoorOpen, LifeBuoy, Pause } from "lucide-react";
import { useState } from "react";
import { api } from "../api.ts";
import { toast } from "../lib/toast.ts";
import type { AppView, SessionRow } from "../types.ts";

export function SessionControls({
  session,
  onChange,
  onGames,
}: {
  session: SessionRow;
  onChange: (view: AppView) => void;
  onGames: () => void;
}) {
  const [pin, setPin] = useState("");
  const [recovery, setRecovery] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);

  async function run(action: () => Promise<AppView>, done: string) {
    try {
      onChange(await action());
      toast(done, "good");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "bad");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {session.level === "light" ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => api.endLight(pin), "Light session paused.");
          }}
        >
          <input type="password" placeholder="PIN to pause" className="mv-input" value={pin} onChange={(event) => setPin(event.target.value)} />
          <button type="submit" className="mv-btn-ghost shrink-0">
            <Pause className="size-4" /> Pause
          </button>
        </form>
      ) : session.blockCompleted ? (
        <button type="button" className="mv-btn" onClick={() => void run(() => api.endEarly(), "Session ended. Well earned.")}>
          <DoorOpen className="size-4" /> End early, you earned it
        </button>
      ) : (
        <button type="button" className="mv-btn-ghost justify-start text-left" onClick={onGames}>
          <DoorOpen className="size-4 shrink-0 text-mv-accent" />
          <span>
            Finish a brain game or a tutor quiz to unlock <strong>End early</strong>.
          </span>
        </button>
      )}
      {showRecovery ? (
        <form
          className="flex animate-mv-rise gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => api.endWithRecovery(recovery), "Session ended with the recovery key.");
          }}
        >
          <input
            placeholder="Recovery key"
            className="mv-input font-mono"
            value={recovery}
            onChange={(event) => setRecovery(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="mv-btn-danger shrink-0">
            End now
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 self-start text-xs text-mv-muted hover:text-mv-bad"
          onClick={() => setShowRecovery(true)}
        >
          <LifeBuoy className="size-3.5" /> Emergency exit with recovery key
        </button>
      )}
    </div>
  );
}
