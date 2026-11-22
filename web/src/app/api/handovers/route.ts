import { createPostHandover } from "./_lib/create-handover";
import { createGetHandovers } from "./_lib/list-handovers";

// B1 #17/#18 and B2-01 agreement are pending. Fail closed until a verified
// auth/access/storage adapter is connected. No public mock or fake save path.
export const POST = createPostHandover();
export const GET = createGetHandovers();
