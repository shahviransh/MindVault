import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  tone: "info" | "good" | "bad";
  text: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

export function toast(text: string, tone: Toast["tone"] = "info", ms = 4500) {
  if (!text) return;
  const id = nextId++;
  toasts = [...toasts.slice(-3), { id, tone, text }];
  emit();
  window.setTimeout(() => dismissToast(id), ms);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
    () => toasts,
  );
}

/** Also tries a system notification, which works when the window is hidden in the tray. */
export function announce(title: string, body: string) {
  toast(`${title}: ${body}`, "info", 7000);
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    // Some webviews expose Notification but refuse to construct it.
  }
}
