import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const originalEnv = { ...process.env };

// ENV is computed once at module-load time from process.env, so each scenario needs a fresh
// module graph with process.env set beforehand.
async function loadLLM(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("./_core/llm");
}

function okResponse(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}

function failResponse(text: string) {
  return { ok: false, status: 500, statusText: "Internal Server Error", headers: { get: () => null }, text: async () => text, body: { cancel: async () => {} } };
}

describe("invokeLLM provider preference (configured OpenAI-compatible provider before Manus Forge)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the configured provider first when both providers are available", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("groq ok"));
    const { invokeLLM } = await loadLLM({
      BUILT_IN_FORGE_API_KEY: "manus-key",
      BUILT_IN_FORGE_API_URL: "https://forge.example",
      FALLBACK_LLM_API_KEY: "groq-key",
      FALLBACK_LLM_API_URL: "https://api.groq.com/openai/v1",
      FALLBACK_LLM_MODEL: "llama-3.3-70b-versatile",
    });

    const result = await invokeLLM({ messages: [{ role: "user", content: "hi" }] });

    expect(result.choices[0].message.content).toBe("groq ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer groq-key");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("llama-3.3-70b-versatile");
  });

  it("uses Manus Forge only if the configured provider exhausts its retries", async () => {
    vi.useFakeTimers();
    // fetchWithBackoff retries the configured provider up to five times before moving on.
    for (let i = 0; i < 5; i++) fetchMock.mockResolvedValueOnce(failResponse("primary down"));
    fetchMock.mockResolvedValueOnce(okResponse("manus backup ok"));

    const { invokeLLM } = await loadLLM({
      BUILT_IN_FORGE_API_KEY: "manus-key",
      BUILT_IN_FORGE_API_URL: "https://forge.example",
      FALLBACK_LLM_API_KEY: "groq-key",
      FALLBACK_LLM_API_URL: "https://api.groq.com/openai/v1",
      FALLBACK_LLM_MODEL: "llama-3.3-70b-versatile",
    });

    const promise = invokeLLM({ messages: [{ role: "user", content: "hi" }] });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.choices[0].message.content).toBe("manus backup ok");
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const [backupUrl, backupInit] = fetchMock.mock.calls[5];
    expect(backupUrl).toBe("https://forge.example/v1/chat/completions");
    expect(backupInit.headers.authorization).toBe("Bearer manus-key");
    expect(JSON.parse(backupInit.body)).not.toHaveProperty("model");
  }, 20000);

  it("defaults the fallback base URL to OpenAI's API when no custom URL is set", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("fallback only"));
    const { invokeLLM } = await loadLLM({ BUILT_IN_FORGE_API_KEY: undefined, FALLBACK_LLM_API_KEY: "fallback-key" });

    await invokeLLM({ messages: [{ role: "user", content: "hi" }] });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("throws a clear error before making any request when neither provider is configured", async () => {
    const { invokeLLM } = await loadLLM({ BUILT_IN_FORGE_API_KEY: undefined, FALLBACK_LLM_API_KEY: undefined });

    await expect(invokeLLM({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/No LLM provider is configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send a model field to the primary provider when the caller didn't ask for one", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("ok"));
    const { invokeLLM } = await loadLLM({ BUILT_IN_FORGE_API_KEY: "primary-key", BUILT_IN_FORGE_API_URL: "https://primary.example" });

    await invokeLLM({ messages: [{ role: "user", content: "hi" }] });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("model");
  });
});
