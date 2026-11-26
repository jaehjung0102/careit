import { createOpenAIDraftProvider, type OpenAIDraftOptions } from "../../../../lib/ai/drafts/openai-provider";
import { createPostDraft, type DraftHttpDependencies } from "./post-draft";

export type OpenAIDraftHttpDependencies = Omit<DraftHttpDependencies, "provider"> & { openai: OpenAIDraftOptions };

// B1 must supply verified authentication and current resident authorization.
// Passing a key alone never makes the public API accessible.
export function createOpenAIPostDraft(dependencies?: OpenAIDraftHttpDependencies) {
  if (!dependencies) return createPostDraft();
  const { openai, ...access } = dependencies;
  const options = { ...openai };
  // Construct inside the request's error boundary, after access validation.
  // Missing credentials return the standard 503 instead of crashing the route.
  return createPostDraft({ ...access, provider: {
    generate: (request, context) => createOpenAIDraftProvider(options).generate(request, context),
  } });
}
