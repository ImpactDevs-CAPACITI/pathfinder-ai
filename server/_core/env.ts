export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Preferred OpenAI-compatible LLM provider (e.g. Groq); Manus Forge is only used if this fails.
  // This app already speaks the OpenAI request/response shape, so switching providers only
  // requires changing the base URL, key, and model values in the environment.
  fallbackApiKey: process.env.FALLBACK_LLM_API_KEY ?? "",
  fallbackApiUrl: process.env.FALLBACK_LLM_API_URL ?? "",
  fallbackModel: process.env.FALLBACK_LLM_MODEL || "gpt-4o-mini",
};
