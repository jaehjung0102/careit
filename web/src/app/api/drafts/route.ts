import { createPostDraft } from "./_lib/post-draft";

// Team AI provider and B1 server authentication/access are not connected yet.
// Missing Bearer => 401; with Bearer but no dependencies => 503. No mock success.
export const POST = createPostDraft();
