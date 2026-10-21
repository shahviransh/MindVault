import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { dismissToast, useToasts } from "../lib/toast.ts";

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-[min(24rem,calc(100%-2.5rem))] flex-col gap-2">
      {toasts.map((item) => {
        const Icon = item.tone === "good" ? CheckCircle2 : item.tone === "bad" ? CircleAlert : Info;
        const color = item.tone === "good" ? "text-mv-good" : item.tone === "bad" ? "text-mv-bad" : "text-mv-accent";
        return (
          <div
            key={item.id}
            role={item.tone === "bad" ? "alert" : "status"}
            className="pointer-events-auto flex animate-mv-rise items-start gap-3 rounded-2xl border border-mv-line bg-mv-solid/95 p-3.5 text-sm shadow-2xl backdrop-blur-xl"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
            <p className="flex-1">{item.text}</p>
            <button type="button" className="text-mv-muted hover:text-mv-ink" aria-label="Dismiss" onClick={() => dismissToast(item.id)}>
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
