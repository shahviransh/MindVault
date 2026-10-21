import { Copy, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../api.ts";
import { toast } from "../lib/toast.ts";
import type { AppView } from "../types.ts";

function SetupFrame({ step, children }: { step: number; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-xl animate-mv-rise">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#0891b2] text-white shadow-xl shadow-violet-600/30">
            <Lock className="size-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">MindVault</h1>
            <p className="text-sm text-mv-muted">Step {step} of 2 · setup</p>
          </div>
        </div>
        <section className="mv-panel">{children}</section>
      </div>
    </div>
  );
}

export function Enroll({ onKey }: { onKey: (key: string) => void }) {
  const [consent, setConsent] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <SetupFrame step={1}>
      <h2 className="mv-title flex items-center gap-2">
        <ShieldCheck className="size-5 text-mv-accent" /> Set this up on your own account
      </h2>
      <ul className="mt-3 space-y-2 text-sm text-mv-muted">
        {[
          "MindVault locks the account that starts it. It does not lock other accounts.",
          "It never blocks Task Manager, Settings, a terminal, Safe Mode, or uninstall.",
          "The recovery key always ends a session. Another admin can uninstall, and that removes the firewall rules.",
        ].map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-mv-accent" />
            {line}
          </li>
        ))}
      </ul>
      <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-mv-line bg-mv-field p-3 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[#7c3aed]"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        I am the owner of this Windows account and I am locking it for myself.
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-mv-muted">
          PIN
          <input type="password" className="mv-input mt-1" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="new-password" />
        </label>
        <label className="block text-sm text-mv-muted">
          Confirm PIN
          <input
            type="password"
            className="mv-input mt-1"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </label>
      </div>
      <button
        type="button"
        className="mv-btn mt-5 w-full py-3"
        disabled={!consent || pin.length < 4}
        onClick={() => {
          if (pin !== confirm) {
            toast("The PIN entries do not match.", "bad");
            return;
          }
          api.enroll(pin).then(onKey).catch((reason: unknown) => toast(String(reason), "bad"));
        }}
      >
        <KeyRound className="size-4" /> Create recovery key
      </button>
      <p className="mt-2 text-center text-xs text-mv-muted">At least 4 characters.</p>
    </SetupFrame>
  );
}

export function SaveKey({
  recoveryKey,
  onSaved,
  onReset,
}: {
  recoveryKey: string;
  onSaved: (view: AppView) => void;
  onReset: (view: AppView) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [pin, setPin] = useState("");
  return (
    <SetupFrame step={2}>
      <h2 className="mv-title flex items-center gap-2">
        <KeyRound className="size-5 text-mv-accent" /> Save this recovery key
      </h2>
      <p className="mt-1 text-sm text-mv-muted">It is shown once. It ends any session immediately. MindVault stores only a hash.</p>
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-mv-accent/50 bg-mv-accent/10 p-4">
        <p className="flex-1 font-mono text-lg font-semibold tracking-wider break-all select-all">
          {recoveryKey || "The key was shown earlier in setup. If you refreshed, reset setup with your PIN."}
        </p>
        {recoveryKey ? (
          <button
            type="button"
            className="mv-icon-btn"
            aria-label="Copy recovery key"
            onClick={() => {
              void navigator.clipboard?.writeText(recoveryKey).then(() => toast("Copied. Store it somewhere safe.", "good"));
            }}
          >
            <Copy className="size-4" />
          </button>
        ) : null}
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-mv-line bg-mv-field p-3 text-sm">
        <input type="checkbox" className="size-4 accent-[#7c3aed]" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
        I stored this key somewhere I can reach during a lock.
      </label>
      <button
        type="button"
        className="mv-btn mt-4 w-full py-3"
        disabled={!saved || recoveryKey.length === 0}
        onClick={() => {
          api.acknowledge().then(onSaved).catch((reason: unknown) => toast(String(reason), "bad"));
        }}
      >
        Continue
      </button>
      <form
        className="mt-5 flex flex-wrap items-center gap-2 border-t border-mv-line pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          api.resetSetup(pin).then(onReset).catch((reason: unknown) => toast(String(reason), "bad"));
        }}
      >
        <span className="text-xs text-mv-muted">Lost it?</span>
        <input type="password" placeholder="PIN" className="mv-input w-36 py-2" value={pin} onChange={(event) => setPin(event.target.value)} />
        <button type="submit" className="mv-btn-ghost py-2">
          Reset setup
        </button>
      </form>
    </SetupFrame>
  );
}
