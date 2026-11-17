import { createAcknowledgeHandover } from "../_lib/acknowledge-handover";

// Same closed-by-default behavior as creation/listing until B1 is connected.
const acknowledge = createAcknowledgeHandover();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return acknowledge(request, id);
}
