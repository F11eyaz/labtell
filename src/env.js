// Настройки LLM из окружения. Локально читаются из .env, на сервере могут прийти из окружения процесса.

try {
  process.loadEnvFile();
} catch {
  // .env нет — используем переменные окружения как есть
}

const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || "";
const provider = process.env.LLM_PROVIDER || (apiKey.startsWith("sk-ant-") ? "anthropic" : "gemini");
const defaultModels = { gemini: "gemini-3.8-flash", anthropic: "claude-opus-5-5" };

export const llm = {
  apiKey,
  provider,
  model: process.env.LLM_MODEL || defaultModels[provider],
};
