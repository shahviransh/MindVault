import { invoke } from "@tauri-apps/api/core";
import { preview } from "./mockBackend.ts";
import type { AppView, Level, Schedule, TutorJob, TutorView } from "./types.ts";

function inTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function call<T>(command: string, args: Record<string, unknown>, fallback: () => T): Promise<T> {
  if (!inTauri()) return fallback();
  return invoke<T>(command, args);
}

export const api = {
  getState: () => call<AppView>("get_state", {}, () => preview.getState()),
  enroll: (pin: string) => call<string>("enroll", { pin }, () => preview.enroll(pin)),
  acknowledge: () => call<AppView>("acknowledge_recovery", {}, () => preview.acknowledge()),
  resetSetup: (pin: string) => call<AppView>("reset_setup", { pin }, () => preview.resetSetup(pin)),
  setAllowlist: (pin: string, hosts: string[]) =>
    call<AppView>("set_allowlist", { pin, hosts }, () => preview.setAllowlist(pin, hosts)),
  setApiConfig: (pin: string, base: string, model: string) =>
    call<AppView>("set_api_config", { pin, base, model }, () => preview.setApiConfig(pin, base, model)),
  setApiKey: (pin: string, key: string) => call<AppView>("set_api_key", { pin, key }, () => preview.setApiKey(pin, key)),
  startSession: (level: Level, minutes: number, pin: string | null) =>
    call<AppView>("start_session", { level, minutes, pin }, () => preview.startSession(level, minutes, pin)),
  setSchedules: (pin: string, schedules: Schedule[]) =>
    call<AppView>("set_schedules", { pin, schedules }, () => preview.setSchedules(pin, schedules)),
  poll: () => call<AppView>("poll", {}, () => preview.poll()),
  completeBlock: () => call<AppView>("complete_block", {}, () => preview.completeBlock()),
  endEarly: () => call<AppView>("end_early", {}, () => preview.endEarly()),
  endLight: (pin: string) => call<AppView>("end_light", { pin }, () => preview.endLight(pin)),
  endWithRecovery: (key: string) => call<AppView>("end_with_recovery", { key }, () => preview.endWithRecovery(key)),
  openStudy: (url: string) => call<void>("open_study", { url }, () => preview.openStudy(url)),
  tutor: (job: TutorJob) => call<TutorView>("tutor", { job }, () => preview.tutor(job)),
  classify: (imageName: string, path: string, publisher: string) =>
    call<AppView>("classify_program", { imageName, path, publisher }, () => preview.classify(imageName)),
  acceptSuggestion: (pin: string) => call<AppView>("accept_suggestion", { pin }, () => preview.accept(pin)),
  dismissSuggestion: (pin: string) => call<AppView>("dismiss_suggestion", { pin }, () => preview.dismiss(pin)),
};
