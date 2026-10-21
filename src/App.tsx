import { FlaskConical } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import { prefsStore } from "./lib/prefs.ts";
import { recordSession, statsStore, streak } from "./lib/stats.ts";
import { toast } from "./lib/toast.ts";
import { FocusPage } from "./pages/FocusPage.tsx";
import { GamesPage } from "./pages/GamesPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { StatsPage } from "./pages/StatsPage.tsx";
import { applyTheme, getStoredTheme, type Theme } from "./theme.ts";
import type { AppView, SessionRow } from "./types.ts";
import { Onboarding } from "./ui/Onboarding.tsx";
import { Enroll, SaveKey } from "./ui/Setup.tsx";
import { Sidebar, type Page } from "./ui/Sidebar.tsx";
import { Toasts } from "./ui/Toasts.tsx";

function elapsedMinutes(session: SessionRow, now: number) {
  const start = new Date(session.startedAt).getTime();
  const end = Math.min(now, new Date(session.endsAt).getTime());
  return Math.max(0, (end - start) / 60_000);
}

export function App() {
  const [view, setViewState] = useState<AppView | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [page, setPage] = useState<Page>("home");
  const [openDaily, setOpenDaily] = useState(false);
  const prefs = prefsStore.use();
  const stats = statsStore.use();
  const lastSession = useRef<SessionRow | null>(null);

  const setView = useCallback((next: AppView) => {
    const before = lastSession.current;
    if (before && !next.session) recordSession(elapsedMinutes(before, Date.now()));
    lastSession.current = next.session;
    setViewState(next);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    api
      .getState()
      .then((initial) => {
        lastSession.current = initial.session;
        setViewState(initial);
      })
      .catch((reason: unknown) => toast(String(reason), "bad"));
  }, []);

  const active = Boolean(view?.session);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!view?.enrolled || !view.recoveryAcknowledged) return;
    const timer = window.setInterval(
      () => {
        const request = active ? api.poll() : api.getState();
        request
          .then((next) => {
            if (!lastSession.current && next.session) toast(`A scheduled ${next.session.level} lock just started.`, "info");
            if (lastSession.current && !next.session) toast("Session complete. Nice work.", "good");
            setView(next);
          })
          .catch((reason: unknown) => toast(String(reason), "bad"));
      },
      active ? 5000 : 30_000,
    );
    return () => window.clearInterval(timer);
  }, [active, view?.enrolled, view?.recoveryAcknowledged, setView]);

  const onDailyOpened = useCallback(() => setOpenDaily(false), []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-mv-line border-t-mv-accent" aria-label="Loading MindVault" />
      </div>
    );
  }

  if (!view.enrolled) {
    return (
      <>
        <Enroll
          onKey={(key) => {
            setRecoveryKey(key);
            setViewState({ ...view, enrolled: true, recoveryAcknowledged: false });
          }}
        />
        <Toasts />
      </>
    );
  }

  if (!view.recoveryAcknowledged) {
    return (
      <>
        <SaveKey
          recoveryKey={recoveryKey}
          onSaved={(next) => {
            setRecoveryKey("");
            setView(next);
          }}
          onReset={(next) => {
            setRecoveryKey("");
            setView(next);
          }}
        />
        <Toasts />
      </>
    );
  }

  const remaining = view.session ? Math.max(0, new Date(view.session.endsAt).getTime() - now) : 0;
  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  return (
    <div className="flex min-h-screen">
      <Sidebar page={page} onPage={setPage} session={view.session} remaining={remaining} streak={streak(stats)} theme={theme} onTheme={toggleTheme} />
      <main className="min-w-0 flex-1 px-6 py-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          {view.practiceMode ? (
            <p className="mb-5 flex items-center gap-2 rounded-2xl border border-mv-warn/30 bg-mv-warn/10 px-4 py-2.5 text-xs text-mv-warn">
              <FlaskConical className="size-4 shrink-0" />
              Preview mode: this copy does not change Windows. Firewall rules are added only by the Windows app, and only while a session is open.
            </p>
          ) : null}
          <div key={page}>
            {page === "home" ? (
              <HomePage
                view={view}
                now={now}
                onChange={setView}
                onPage={setPage}
                onDaily={() => {
                  setOpenDaily(true);
                  setPage("games");
                }}
              />
            ) : null}
            {page === "focus" ? <FocusPage view={view} onChange={setView} onPage={setPage} /> : null}
            {page === "games" ? <GamesPage view={view} onChange={setView} openDaily={openDaily} onDailyOpened={onDailyOpened} /> : null}
            {page === "stats" ? <StatsPage /> : null}
            {page === "settings" ? (
              <SettingsPage
                view={view}
                onChange={setView}
                theme={theme}
                onTheme={setTheme}
                onReplayTour={() => prefsStore.update((current) => ({ ...current, onboarded: false }))}
              />
            ) : null}
          </div>
        </div>
      </main>
      {!prefs.onboarded ? <Onboarding onDone={() => prefsStore.update((current) => ({ ...current, onboarded: true }))} /> : null}
      <Toasts />
    </div>
  );
}
