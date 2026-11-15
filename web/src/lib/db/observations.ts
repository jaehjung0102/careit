import { createClient } from "@/lib/supabase/client";

export type Observation = {
  id: string;
  resident_id: string;
  meal: string;
  water: string;
  bowel: string;
  walking: string;
  created_at: string;
};
export type ObservationInput = Omit<Observation, "created_at">;

let authentication: Promise<void> | undefined;
async function authenticate() {
  const client = createClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const { error: signInError } = await client.auth.signInAnonymously();
    if (signInError) throw signInError;
  }
}
async function ready() {
  authentication ??= authenticate().finally(() => { authentication = undefined; });
  await authentication;
  return createClient();
}
export async function listObservations() {
  const client = await ready();
  const { data, error } = await client.from("observations")
    .select("id,resident_id,meal,water,bowel,walking,created_at")
    .order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return data as Observation[];
}
export async function saveObservation(input: ObservationInput) {
  const client = await ready();
  // Reuse the request ID on retry so an uncertain network response cannot create duplicates.
  const { data, error } = await client.from("observations").insert(input)
    .select("id,resident_id,meal,water,bowel,walking,created_at").single();
  if (error?.code === "23505") {
    const existing = await client.from("observations").select("id,resident_id,meal,water,bowel,walking,created_at").eq("id", input.id).single();
    if (existing.error) throw existing.error;
    return existing.data as Observation;
  }
  if (error) throw error;
  return data as Observation;
}
