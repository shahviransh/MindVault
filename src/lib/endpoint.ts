export function isLoopbackBase(base: string): boolean {
  try {
    const host = new URL(base).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export const LOCAL_PRESETS = [
  { id: "ollama", label: "Ollama", base: "http://127.0.0.1:11434/v1", model: "llama3.2" },
  { id: "lmstudio", label: "LM Studio", base: "http://127.0.0.1:1234/v1", model: "local-model" },
  { id: "llamacpp", label: "llama.cpp", base: "http://127.0.0.1:8080/v1", model: "local-model" },
] as const;

/** Keyless tutors. Each one was checked to answer without an account. */
export const FREE_TUTORS = [
  {
    id: "kilo",
    label: "Kilo Auto",
    base: "https://ai-gateway.kilo.ai/api/v1",
    model: "kilo-auto/free",
    detail: "No account and no API key. The page you study is sent to Kilo, which picks a free model. Leave personal details out of the page. About 200 replies an hour.",
  },
  {
    id: "devtoolbox",
    label: "DevToolBox",
    base: "https://devtoolbox-api.devtoolbox-api.workers.dev/ai/generate",
    model: "llama-3.2-3b-instruct",
    detail: "No account and no API key. The page you study is sent to DevToolBox, which runs Llama 3.2.",
  },
] as const;

export const FREE_TUTOR = FREE_TUTORS[0];

export const CLOUD_BASE = "https://api.openai.com/v1";
export const CLOUD_MODEL = "gpt-4o-mini";

export function isKeylessBase(base: string): boolean {
  const normalized = base.trim().replace(/\/$/, "");
  return FREE_TUTORS.some((tutor) => tutor.base === normalized);
}

export function allowsEmptyKey(base: string): boolean {
  return isLoopbackBase(base) || isKeylessBase(base);
}
