import { BookOpen, ExternalLink, Gamepad2, GraduationCap, Layers, Lock, MessageSquareOff, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../api.ts";
import { hostKind } from "../hostCatalog.ts";
import { recordSolve } from "../lib/stats.ts";
import { toast } from "../lib/toast.ts";
import type { AppView, TutorJob, TutorView } from "../types.ts";
import type { Page } from "../ui/Sidebar.tsx";

type Tab = "browse" | "tutor";

export function FocusPage({
  view,
  onChange,
  onPage,
}: {
  view: AppView;
  onChange: (view: AppView) => void;
  onPage: (page: Page) => void;
}) {
  const session = view.session;
  const [tab, setTab] = useState<Tab>("browse");

  if (!session) {
    return (
      <div className="mx-auto mt-16 max-w-md animate-mv-rise text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-mv-accent/15 text-mv-accent">
          <Lock className="size-7" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight">The study desk opens during a session</h1>
        <p className="mt-2 text-sm text-mv-muted">
          It uses the site list you froze at the start, so nothing can be added mid-session. Brain games work any time.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" className="mv-btn" onClick={() => onPage("home")}>
            Start a session
          </button>
          <button type="button" className="mv-btn-ghost" onClick={() => onPage("games")}>
            <Gamepad2 className="size-4" /> Brain games
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4 animate-mv-rise">
        <div>
          <p className="mv-label">Study desk</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Learn it yourself</h1>
        </div>
        <div className="mv-segment">
          <button type="button" className={tab === "browse" ? "mv-tab-on" : "mv-tab"} onClick={() => setTab("browse")}>
            <BookOpen className="size-4" /> Browse
          </button>
          <button type="button" className={tab === "tutor" ? "mv-tab-on" : "mv-tab"} onClick={() => setTab("tutor")}>
            <GraduationCap className="size-4" /> Tutor
          </button>
        </div>
      </header>
      {tab === "browse" ? <Browse hosts={session.frozenAllow} /> : <Tutor blockCompleted={session.blockCompleted} onChange={onChange} />}
    </div>
  );
}

function Browse({ hosts }: { hosts: string[] }) {
  const [url, setUrl] = useState("https://en.wikipedia.org/wiki/Active_recall");
  const studyHosts = hosts.filter((host) => hostKind(host) === "study");
  const gameHosts = hosts.filter((host) => hostKind(host) === "game");

  async function open(target: string) {
    try {
      await api.openStudy(target);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "bad");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        className="mv-panel flex animate-mv-rise items-center gap-2 p-2 sm:p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void open(url);
        }}
      >
        <Search className="ml-3 size-5 shrink-0 text-mv-muted" />
        <input
          aria-label="Study page"
          className="flex-1 bg-transparent px-2 py-2.5 text-sm outline-none"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="submit" className="mv-btn">
          Open <ExternalLink className="size-4" />
        </button>
      </form>
      <div className="grid gap-5 lg:grid-cols-2">
        <HostGroup title="Study" icon={BookOpen} hosts={studyHosts} onOpen={(host) => void open(`https://${host}`)} />
        <HostGroup title="Online puzzle games" icon={Gamepad2} hosts={gameHosts} onOpen={(host) => void open(`https://${host}`)} />
      </div>
      <p className="text-xs text-mv-muted">
        Pages open in MindVault's own browser window, never your system browser. Links that leave this list are refused. The list stays frozen until
        the session ends.
      </p>
    </div>
  );
}

function HostGroup({
  title,
  icon: Icon,
  hosts,
  onOpen,
}: {
  title: string;
  icon: typeof BookOpen;
  hosts: string[];
  onOpen: (host: string) => void;
}) {
  return (
    <section className="mv-panel animate-mv-rise">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Icon className="size-4 text-mv-accent" /> {title}
        <span className="ml-auto text-xs font-normal text-mv-muted">{hosts.length}</span>
      </h2>
      {hosts.length === 0 ? (
        <p className="mt-3 text-sm text-mv-muted">None on this session's list.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {hosts.map((host) => (
            <button
              key={host}
              type="button"
              className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-mv-line bg-mv-field p-3 text-left transition hover:-translate-y-0.5 hover:border-mv-accent/50"
              onClick={() => onOpen(host)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-mv-accent/20 to-mv-accent-2/20 font-display text-sm font-bold text-mv-accent uppercase">
                {host[0]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{host}</span>
              <ExternalLink className="size-3.5 text-mv-muted opacity-0 transition group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Tutor({ blockCompleted, onChange }: { blockCompleted: boolean; onChange: (view: AppView) => void }) {
  const [source, setSource] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [result, setResult] = useState<TutorView | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(job: TutorJob) {
    setBusy(true);
    try {
      setResult(await api.tutor(job));
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function solved() {
    recordSolve("quiz");
    if (blockCompleted) return;
    try {
      onChange(await api.completeBlock());
      toast("Quiz passed. End early is unlocked.", "good");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "bad");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <section className="mv-panel animate-mv-rise">
        <p className="flex items-center gap-2 text-xs text-mv-muted">
          <MessageSquareOff className="size-4" /> Buttons only. There is no chat box, and a reply cannot change the lock.
        </p>
        <label className="mt-4 block">
          <span className="mv-label">Source text</span>
          <textarea
            className="mv-input mt-2 min-h-36"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="Paste a paragraph or notes you are studying…"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="mv-btn" disabled={busy || !source.trim()} onClick={() => void run({ job: "quiz", source })}>
            <Sparkles className="size-4" /> Quiz me
          </button>
          <button type="button" className="mv-btn-ghost" disabled={busy || !source.trim()} onClick={() => void run({ job: "summarizeThenQuiz", source })}>
            Summarize, then quiz
          </button>
          <button type="button" className="mv-btn-ghost" disabled={busy || !source.trim()} onClick={() => void run({ job: "flashcards", source })}>
            <Layers className="size-4" /> Flashcards
          </button>
        </div>

        <div className="mt-6 border-t border-mv-line pt-5">
          <span className="mv-label">Grade my answer</span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input aria-label="Question" placeholder="Question" className="mv-input" value={question} onChange={(event) => setQuestion(event.target.value)} />
            <input aria-label="Your answer" placeholder="Your answer" className="mv-input" value={answer} onChange={(event) => setAnswer(event.target.value)} />
          </div>
          <button type="button" className="mv-btn-ghost mt-2" disabled={busy || !question.trim()} onClick={() => void run({ job: "grade", question, answer })}>
            Grade this answer
          </button>
        </div>

        <div className="mt-6 border-t border-mv-line pt-5">
          <span className="mv-label">Explain it back</span>
          <textarea
            className="mv-input mt-2 min-h-24"
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            placeholder="Explain the source in your own words…"
          />
          <button
            type="button"
            className="mv-btn-ghost mt-2"
            disabled={busy || !explanation.trim()}
            onClick={() => void run({ job: "explainBack", source, explanation })}
          >
            Find the gaps
          </button>
        </div>
      </section>

      <section className="mv-panel animate-mv-rise">
        <p className="mv-label">Result</p>
        {busy ? (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-4 animate-pulse rounded-full bg-mv-line" style={{ width: `${90 - row * 20}%` }} />
            ))}
          </div>
        ) : result ? (
          <TutorResult key={JSON.stringify(result)} result={result} onSolved={() => void solved()} />
        ) : (
          <p className="mt-4 text-sm text-mv-muted">Pick an action on the left. Summaries stay hidden until you answer a question first.</p>
        )}
      </section>
    </div>
  );
}

function TutorResult({ result, onSolved }: { result: TutorView; onSolved: () => void }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const answered = Object.keys(picked).length > 0;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {result.summary ? (
        summaryOpen ? (
          <p className="animate-mv-rise rounded-2xl bg-mv-accent/10 p-4 text-sm leading-relaxed">{result.summary}</p>
        ) : (
          <button type="button" className="mv-btn-ghost self-start" onClick={() => setSummaryOpen(true)} disabled={!answered && result.questions.length > 0}>
            {answered || result.questions.length === 0 ? "Show summary" : "Answer first to see the summary"}
          </button>
        )
      ) : null}
      {result.questions.map((item, questionIndex) => (
        <article key={item.prompt} className="rounded-2xl border border-mv-line bg-mv-field p-4">
          <h3 className="text-sm font-semibold">{item.prompt}</h3>
          <div className="mt-3 flex flex-col gap-2">
            {item.choices.map((choice, index) => {
              const chosen = picked[questionIndex] === index;
              const correct = index === item.answerIndex;
              return (
                <button
                  key={choice}
                  type="button"
                  className={`cursor-pointer rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
                    chosen
                      ? correct
                        ? "border-mv-good bg-mv-good/15 font-semibold text-mv-good"
                        : "border-mv-bad bg-mv-bad/10 text-mv-bad"
                      : "border-mv-line hover:border-mv-accent/50 hover:bg-mv-accent/10"
                  }`}
                  onClick={() => {
                    setPicked((current) => ({ ...current, [questionIndex]: index }));
                    if (correct) onSolved();
                  }}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        </article>
      ))}
      {result.cards.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {result.cards.map((card, index) => (
            <button
              key={card.front}
              type="button"
              className={`mv-card-flip ${flipped.has(index) ? "border-mv-accent/50 bg-mv-accent/10" : ""}`}
              onClick={() =>
                setFlipped((current) => {
                  const next = new Set(current);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                })
              }
            >
              <span className="mv-label">{flipped.has(index) ? "Answer" : "Question"}</span>
              <span className="mt-2 block">{flipped.has(index) ? card.back : card.front}</span>
            </button>
          ))}
        </div>
      ) : null}
      {result.grade ? (
        <p className={`rounded-2xl p-4 text-sm ${result.grade.correct ? "bg-mv-good/10 text-mv-good" : "bg-mv-warn/10 text-mv-warn"}`}>
          <strong>{result.grade.correct ? "Correct. " : "Not yet. "}</strong>
          {result.grade.explanation}
        </p>
      ) : null}
      {result.gaps.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {result.gaps.map((gap) => (
            <li key={gap} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-mv-warn" />
              {gap}
            </li>
          ))}
        </ul>
      ) : null}
      {result.followUp ? <p className="text-sm text-mv-muted italic">{result.followUp}</p> : null}
    </div>
  );
}
