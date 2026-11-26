import { createOpenAIPostDraft } from "./_lib/openai-post-draft";

// OpenAI adapter is available, but B1 verified authentication/access is pending.
// Missing Bearer => 401; with Bearer but no dependencies => 503. No mock success.
export const POST = createOpenAIPostDraft();
