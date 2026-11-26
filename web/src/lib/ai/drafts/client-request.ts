import type { DraftInput } from "./input";
import type { DraftGenerationResult } from "./generate-draft";

const CLIENT_ERRORS = {
  INVALID_REQUEST: "입력 형식을 확인해 주세요.",
  UNAUTHENTICATED: "로그인을 다시 확인해 주세요. 입력은 유지됩니다.",
  FORBIDDEN: "초안을 생성할 권한이 없습니다.",
  NOT_FOUND: "접근 가능한 어르신을 찾을 수 없습니다.",
  VALIDATION_ERROR: "관찰 입력을 확인하고 다시 생성해 주세요.",
  RATE_LIMITED: "잠시 후 다시 시도해 주세요. 입력은 유지됩니다.",
  DEPENDENCY_NOT_READY: "초안 생성 서비스 연결을 준비 중입니다. 입력은 유지됩니다.",
  SERVICE_UNAVAILABLE: "서비스 연결에 실패했습니다. 입력은 유지됩니다.",
  INTERNAL_ERROR: "초안을 생성하지 못했습니다. 입력은 유지됩니다.",
  NETWORK_ERROR: "연결에 실패했습니다. 입력을 유지하고 다시 시도해 주세요.",
  CANCELLED: "초안 요청을 취소했습니다. 입력은 유지됩니다.",
  INVALID_RESPONSE: "초안 응답을 확인할 수 없습니다. 다시 생성해 주세요.",
} as const;

export type DraftClientFailure = {
  code: keyof typeof CLIENT_ERRORS;
  message: string;
  retryable: boolean;
  retry_after_seconds?: number;
  fields?: Record<string, string>;
};

export class DraftClientError extends Error {
  readonly failure: DraftClientFailure;
  constructor(code: keyof typeof CLIENT_ERRORS, details: Omit<DraftClientFailure, "code" | "message"> = { retryable: false }) {
    super(CLIENT_ERRORS[code]);
    this.failure = { code, message: CLIENT_ERRORS[code], ...details };
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Envelope/identity check only. Fact preservation belongs to the server verifier.
// Rebuild the result so unknown response fields cannot become approval/save state.
export function readDraftResponse(input: DraftInput, value: unknown): DraftGenerationResult {
  if (!object(value) || !object(value.data) || !object(value.meta)) throw new DraftClientError("INVALID_RESPONSE");
  const { data, meta } = value;
  const validMode = (data.generation_mode === "llm" && data.fallback_reason === null)
    || (data.generation_mode === "template" && typeof data.fallback_reason === "string"
      && ["timeout", "provider_error", "invalid_output"].includes(data.fallback_reason));
  if (meta.contract_version !== "b2-01-draft-3" || meta.data_source !== "generated"
    || data.resident_id !== input.observation.resident_id || data.input_revision !== input.input_revision
    || data.requires_confirmation !== true || typeof data.draft_text !== "string" || !data.draft_text.trim() || !validMode) {
    throw new DraftClientError("INVALID_RESPONSE");
  }
  return {
    data: {
      resident_id: data.resident_id, input_revision: data.input_revision, draft_text: data.draft_text,
      generation_mode: data.generation_mode as "llm" | "template",
      fallback_reason: data.fallback_reason as DraftGenerationResult["data"]["fallback_reason"],
      requires_confirmation: true,
    },
    meta: { contract_version: "b2-01-draft-3", data_source: "generated" },
  };
}

const HTTP_CODES: Record<number, readonly string[]> = {
  400: ["INVALID_REQUEST"], 401: ["UNAUTHENTICATED"], 403: ["FORBIDDEN"], 404: ["NOT_FOUND"],
  422: ["VALIDATION_ERROR"], 429: ["RATE_LIMITED"],
  503: ["DEPENDENCY_NOT_READY", "SERVICE_UNAVAILABLE"], 500: ["INTERNAL_ERROR"],
};

function responseFailure(response: Response, value: unknown): DraftClientError {
  if (!object(value) || !object(value.error) || !object(value.meta)
    || value.meta.contract_version !== "b2-01-draft-3"
    || typeof value.error.code !== "string" || !HTTP_CODES[response.status]?.includes(value.error.code)) {
    return new DraftClientError("INVALID_RESPONSE");
  }
  const code = value.error.code as keyof typeof CLIENT_ERRORS;
  const retryable = code === "RATE_LIMITED" || code === "SERVICE_UNAVAILABLE";
  const fields: Record<string, string> = {};
  if (code === "VALIDATION_ERROR" && object(value.error.fields)) {
    // Preserve field paths for highlighting, but never display arbitrary upstream
    // messages, HTML, credentials or diagnostics as the user-facing error text.
    for (const path of Object.keys(value.error.fields)) {
      if (/^(input_revision|observation(?:\.[a-z_]+){0,3})$/.test(path)) fields[path] = "입력을 확인해 주세요.";
    }
  }
  const retry = response.headers.get("retry-after");
  const retrySeconds = retry !== null && /^\d+$/.test(retry) ? Number(retry) : NaN;
  return new DraftClientError(code, {
    retryable,
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(code === "RATE_LIMITED" && Number.isSafeInteger(retrySeconds) && retrySeconds > 0 ? { retry_after_seconds: retrySeconds } : {}),
  });
}

export async function requestDraft(input: DraftInput, accessToken: string, options: {
  signal?: AbortSignal;
  fetch?: typeof fetch;
} = {}): Promise<DraftGenerationResult> {
  // Fixed same-origin endpoint. The token is never put in state, a URL or an error.
  if (!accessToken || /[\s,]/.test(accessToken)) throw new DraftClientError("UNAUTHENTICATED");
  const snapshot = structuredClone(input);
  if (options.signal?.aborted) throw new DraftClientError("CANCELLED");
  let response: Response;
  let value: unknown;
  try {
    response = await (options.fetch ?? fetch)("/api/drafts", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(snapshot), cache: "no-store", redirect: "error", signal: options.signal,
    });
    value = await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw new DraftClientError("CANCELLED");
    if (error instanceof SyntaxError) throw new DraftClientError("INVALID_RESPONSE");
    throw new DraftClientError("NETWORK_ERROR", { retryable: true });
  }
  // Covers a transport that finishes even after it was asked to abort.
  if (options.signal?.aborted) throw new DraftClientError("CANCELLED");
  if (response.status !== 200) throw responseFailure(response, value);
  return readDraftResponse(snapshot, value);
}
