const DEFAULT_OPENAI_COMPAT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_COMPAT_MODEL = "gpt-5.4-mini";
const DEFAULT_BAYESDL_BASE_URL = "https://token.bayesdl.com/api/maas/v1";
const DEFAULT_BAYESDL_MODEL = "deepseek-v3.2";

export function getLlmProviderStatus() {
  const config = getLlmConfig();
  return {
    provider: "openai-compatible",
    enabled: Boolean(config.apiKey),
    baseUrl: config.baseUrl,
    model: config.model,
    apiKeyPresent: Boolean(config.apiKey),
    compatibilityMode: config.compatibilityMode,
    env: {
      preferred: ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"],
      backwardCompatible: ["OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL", "BAYESDL_BASE_URL", "BAYESDL_API_KEY", "BAYESDL_MODEL"]
    }
  };
}

export function isLlmProviderEnabled() {
  return Boolean(getLlmConfig().apiKey);
}

export async function callLlmChat({ messages, temperature = 0.2, maxTokens = 900, responseFormat = null }) {
  const config = getLlmConfig();
  if (!config.apiKey) {
    throw new Error("LLM provider is disabled because no API key is configured.");
  }

  const body = {
    model: config.model,
    messages,
    temperature,
    max_tokens: maxTokens
  };
  if (responseFormat) body.response_format = responseFormat;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LLM HTTP ${response.status}: ${text.slice(0, 240)}`);
  }

  const payload = JSON.parse(text);
  return {
    content: payload.choices?.[0]?.message?.content || "",
    model: payload.model || config.model,
    raw: payload
  };
}

function getLlmConfig() {
  const hasPreferredKey = Boolean(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);
  const hasBayesKey = Boolean(process.env.BAYESDL_API_KEY);
  const compatibilityMode = hasPreferredKey ? "llm" : hasBayesKey ? "bayesdl" : "disabled";

  const rawBaseUrl =
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.BAYESDL_BASE_URL ||
    (compatibilityMode === "bayesdl" ? DEFAULT_BAYESDL_BASE_URL : DEFAULT_OPENAI_COMPAT_BASE_URL);

  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.BAYESDL_API_KEY ||
    "";

  const model =
    process.env.LLM_REASONING_MODEL ||
    process.env.LLM_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.BAYESDL_MODEL ||
    (compatibilityMode === "bayesdl" ? DEFAULT_BAYESDL_MODEL : DEFAULT_OPENAI_COMPAT_MODEL);

  return {
    baseUrl: normalizeOpenAiCompatibleBaseUrl(rawBaseUrl, compatibilityMode),
    apiKey,
    model,
    compatibilityMode
  };
}

function normalizeOpenAiCompatibleBaseUrl(rawBaseUrl, compatibilityMode) {
  const value = String(rawBaseUrl || "").trim().replace(/\/+$/, "");
  if (!value) return compatibilityMode === "bayesdl" ? DEFAULT_BAYESDL_BASE_URL : DEFAULT_OPENAI_COMPAT_BASE_URL;
  if (value.endsWith("/v1") || value.includes("/api/maas/v1")) return value;
  return `${value}/v1`;
}
