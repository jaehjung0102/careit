import { DraftInputError } from "../../../../lib/ai/drafts/input";
import { DraftDependencyError } from "../../../../lib/ai/drafts/generate-draft";

const HTTP_ERRORS = {
  INVALID_REQUEST: { status: 400, message: "올바른 JSON 형식으로 보내 주세요." },
  UNAUTHENTICATED: { status: 401, message: "로그인을 확인해 주세요." },
  FORBIDDEN: { status: 403, message: "초안을 생성할 권한이 없습니다." },
  NOT_FOUND: { status: 404, message: "접근 가능한 어르신을 찾을 수 없습니다." },
  RATE_LIMITED: { status: 429, message: "잠시 후 다시 시도해 주세요." },
  SERVICE_UNAVAILABLE: { status: 503, message: "서비스를 일시적으로 사용할 수 없습니다." },
} as const;

// Trusted adapters map auth/access failures to these codes. Never put upstream
// error bodies, tokens, source notes or client-supplied messages in responses.
export class DraftHttpError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;
  constructor(readonly code: keyof typeof HTTP_ERRORS, retryAfterSeconds = 30) {
    super(HTTP_ERRORS[code].message);
    this.status = HTTP_ERRORS[code].status;
    if (code === "RATE_LIMITED") {
      this.retryAfterSeconds = Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds : 30;
    }
  }
}

export function draftErrorResponse(error: unknown): Response {
  const known = error instanceof DraftInputError || error instanceof DraftDependencyError || error instanceof DraftHttpError;
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (error instanceof DraftHttpError && error.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(error.retryAfterSeconds);
  }
  return Response.json({
    error: {
      code: known ? error.code : "INTERNAL_ERROR",
      message: known ? error.message : "초안을 생성하지 못했습니다.",
      ...(error instanceof DraftInputError ? { fields: error.fields } : {}),
      retryable: error instanceof DraftHttpError && (error.code === "SERVICE_UNAVAILABLE" || error.code === "RATE_LIMITED"),
    },
    meta: { contract_version: "b2-01-draft-3" },
  }, { status: known ? error.status : 500, headers });
}
