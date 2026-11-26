import { createGetChanges } from "./_lib/get-changes";

// B1 #20 authorized complete-history adapter is not connected. No public mock
// success response: absent token => 401; Bearer without dependencies => 503.
export const GET = createGetChanges();
