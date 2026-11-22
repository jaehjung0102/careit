import { CONTRACT_VERSION, HandoverError, type HandoverActor } from "./contract";

export type HandoverAuthentication = {
  authenticate(token: string): Promise<HandoverActor>;
};

export async function authenticateRequest(request: Request, dependencies?: HandoverAuthentication) {
  const token = /^Bearer ([^\s,]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) throw new HandoverError("UNAUTHENTICATED", "로그인이 필요합니다.");
  if (!dependencies) {
    throw new HandoverError("DEPENDENCY_NOT_READY", "인계 저장·권한 연결을 준비 중입니다.");
  }
  const actor = await dependencies.authenticate(token);
  if (!actor.id) throw new HandoverError("UNAUTHENTICATED", "로그인을 확인해 주세요.");
  return actor;
}

export function errorResponse(error: unknown, fallbackMessage: string): Response {
  const known = error instanceof HandoverError;
  return Response.json({
    error: {
      code: known ? error.code : "INTERNAL_ERROR",
      message: known ? error.message : fallbackMessage,
      ...(known && error.fields ? { fields: error.fields } : {}),
      retryable: known && error.code === "SERVICE_UNAVAILABLE",
    },
    meta: { contract_version: CONTRACT_VERSION },
  }, { status: known ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
