import { generateDraft, DraftDependencyError, type DraftProvider } from "../../../../lib/ai/drafts/generate-draft";
import { DraftHttpError, draftErrorResponse } from "./http";

export type DraftActor = { id: string };
export type DraftHttpDependencies = {
  // Verify the token with the auth service. Decoding a JWT is not verification.
  authenticate(token: string): Promise<DraftActor>;
  // Check current resident visibility AND permission to generate care notes.
  // Hidden/missing resident => NOT_FOUND; visible but disallowed => FORBIDDEN.
  authorizeResident(actor: DraftActor, residentId: string): Promise<void>;
  provider: DraftProvider;
  now?: () => Date;
  timeoutMs?: number;
};

export function createPostDraft(dependencies?: DraftHttpDependencies) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const token = /^Bearer ([^\s,]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
      if (!token) throw new DraftHttpError("UNAUTHENTICATED");
      if (typeof dependencies?.authenticate !== "function") throw new DraftDependencyError();
      // Authentication precedes body parsing/validation. A header alone grants
      // nothing; this callback and resource authorization must be real services.
      const actor = await dependencies.authenticate(token);
      if (!actor || typeof actor.id !== "string" || !actor.id.trim()) throw new DraftHttpError("UNAUTHENTICATED");
      if (typeof dependencies.authorizeResident !== "function" || typeof dependencies.provider?.generate !== "function") {
        throw new DraftDependencyError();
      }
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        throw new DraftHttpError("INVALID_REQUEST");
      }
      let body: unknown;
      try { body = await request.json(); }
      catch { throw new DraftHttpError("INVALID_REQUEST"); }
      const result = await generateDraft(body, {
        authorizeResident: (residentId) => dependencies.authorizeResident(actor, residentId),
        provider: dependencies.provider,
        now: dependencies.now,
        timeoutMs: dependencies.timeoutMs,
      });
      // Draft only: no observation insert, approval, or save completion here.
      return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return draftErrorResponse(error);
    }
  };
}
