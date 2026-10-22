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

/** Classic Pollinations text API. Anonymous, one reply about every 30 seconds. */
export const FREE_TUTOR = {
  id: "free",
  label: "Free online model",
  base: "https://text.pollinations.ai/openai",
  model: "openai-fast",
} as const;

export const CLOUD_BASE = "https://api.openai.com/v1";
export const CLOUD_MODEL = "gpt-4o-mini";

export function isKeylessBase(base: string): boolean {
  try {
    const url = new URL(base.trim());
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "text.pollinations.ai" &&
      url.port === "" &&
      url.pathname.replace(/\/$/, "") === "/openai" &&
      url.search === ""
    );
  } catch {
    return false;
  }
}

export function allowsEmptyKey(base: string): boolean {
  return isLoopbackBase(base) || isKeylessBase(base);
}
