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

export const CLOUD_BASE = "https://api.openai.com/v1";
export const CLOUD_MODEL = "gpt-4o-mini";
