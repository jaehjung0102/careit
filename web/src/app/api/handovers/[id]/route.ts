import { createHandoverDetail } from "../_lib/handover-detail";

const detail = createHandoverDetail();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return detail.get(request, (await context.params).id);
}

export async function PATCH(request: Request, context: Context) {
  return detail.patch(request, (await context.params).id);
}
