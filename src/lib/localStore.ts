import { useSyncExternalStore } from "react";

/** A tiny localStorage-backed store that React components can subscribe to. */
export function localStore<T extends object>(key: string, defaults: T) {
  const listeners = new Set<() => void>();
  let cache: T | null = null;

  function read(): T {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(key);
      cache = raw ? { ...defaults, ...(JSON.parse(raw) as Partial<T>) } : defaults;
    } catch {
      cache = defaults;
    }
    return cache;
  }

  function write(next: T) {
    cache = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage can be unavailable; the in-memory copy still works for this run.
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    get: read,
    set: write,
    update(change: (current: T) => T) {
      write(change(read()));
    },
    use(): T {
      return useSyncExternalStore(subscribe, read, read);
    },
  };
}
