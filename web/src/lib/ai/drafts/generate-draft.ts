import { previewTemplateDraft } from "./template-preview";
import { buildProviderRequest, validateGeneratedDraft, type DraftProviderRequest } from "./output-validation";

export const DEFAULT_DRAFT_TIMEOUT_MS = 10_000;
export type DraftFallbackReason = "timeout" | "provider_error" | "invalid_output";
export type DraftGenerationResult = {
  data: {
    resident_id: string; input_revision: number; draft_text: string;
    generation_mode: "llm" | "template";
    fallback_reason: DraftFallbackReason | null;
    requires_confirmation: true;
  };
  meta: { contract_version: "b2-01-draft-3"; data_source: "generated" };
};
export type DraftProvider = {
  // The real adapter must propagate this signal to its outgoing request.
  generate(request: DraftProviderRequest, options: { signal: AbortSignal }): Promise<unknown>;
};
export type DraftGenerationDependencies = {
  // Required trusted server callback: authenticate the request and check this
  // resident's current access, throwing 401/403/404/503 as appropriate.
  // Never implement this by trusting IDs/roles supplied by the browser.
  authorizeResident(residentId: string): Promise<void>;
  provider?: DraftProvider;
  now?: () => Date;
  // Server configuration/test override only; never read this from user input.
  timeoutMs?: number;
};

export class DraftDependencyError extends Error {
  readonly code = "DEPENDENCY_NOT_READY";
  readonly status = 503;
  readonly retryable = false;
  constructor() { super("초안 생성 서비스 연결을 준비 중입니다."); }
}

const DEADLINE = Symbol("draft-provider-deadline");
async function callWithDeadline(provider: DraftProvider, request: DraftProviderRequest, timeoutMs: number) {
  const controller = new AbortController();
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(DEADLINE);
      controller.abort();
    }, timeoutMs);
  });
  // Promise wrapping also catches a synchronous adapter throw. race attaches
  // handlers to late rejections; an adapter ignoring abort cannot replace fallback.
  const work = Promise.resolve().then(() => provider.generate(request, { signal: controller.signal }));
  try {
    const output = await Promise.race([work, timeout]);
    if (performance.now() - started >= timeoutMs) {
      controller.abort();
      throw DEADLINE;
    }
    return output;
  } finally {
    clearTimeout(timer);
  }
}

// Internal service only. No live provider or public HTTP route is installed here.
// A future route must authenticate before exposing validation and map exceptions
// to the shared error envelope without returning raw provider/server errors.
export async function generateDraft(value: unknown, dependencies?: DraftGenerationDependencies): Promise<DraftGenerationResult> {
  const preview = previewTemplateDraft(value, dependencies?.now?.() ?? new Date());
  if (typeof dependencies?.authorizeResident !== "function" || typeof dependencies.provider?.generate !== "function") {
    throw new DraftDependencyError();
  }
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_DRAFT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new DraftDependencyError();
  const provider = dependencies.provider;
  // Auth/access failures stay errors. They are outside the provider fallback catch.
  await dependencies.authorizeResident(preview.input.observation.resident_id);

  const result = (text: string, reason: DraftFallbackReason | null): DraftGenerationResult => ({
    data: {
      resident_id: preview.input.observation.resident_id, input_revision: preview.input.input_revision,
      draft_text: text, generation_mode: reason === null ? "llm" : "template",
      fallback_reason: reason, requires_confirmation: true,
    },
    meta: { contract_version: "b2-01-draft-3", data_source: "generated" },
  });

  let candidate: unknown;
  try {
    // Built anew: the adapter cannot mutate the input snapshot or expected facts.
    candidate = await callWithDeadline(provider, buildProviderRequest(preview.input), timeoutMs);
  } catch (error) {
    return result(preview.draft_text, error === DEADLINE ? "timeout" : "provider_error");
  }
  const checked = validateGeneratedDraft(preview.input, candidate);
  return checked.ok ? result(checked.draft_text, null) : result(preview.draft_text, "invalid_output");
}
