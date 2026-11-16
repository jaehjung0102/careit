import { createClient } from "@/lib/supabase/client";

export type Observation = {
  id: string;
  resident_id: string;
  meal_period: string | null;
  meal: string;
  water: string;
  bowel: string;
  walking: string;
  urination: string | null;
  pain: string | null;
  skin: string | null;
  sleep: string | null;
  mood: string | null;
  cognition: string | null;
  communication: string | null;
  hygiene: string | null;
  oral_care: string | null;
  medication: string | null;
  activity: string | null;
  emotional_support: string | null;
  created_at: string;
};
export type ObservationInput = {
  id: string;
  resident_id: string;
  meal_period: string;
  meal: string;
  water: string;
  bowel: string;
  walking: string;
  urination: string;
  pain: string;
  skin: string;
  sleep: string;
  mood: string;
  cognition: string;
  communication: string;
  hygiene: string;
  oral_care: string;
  medication: string;
  activity: string;
  emotional_support: string;
};

const columns = "id,resident_id,meal_period,meal,water,bowel,walking,urination,pain,skin,sleep,mood,cognition,communication,hygiene,oral_care,medication,activity,emotional_support,created_at";

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
    .select(columns)
    .order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return data as Observation[];
}
export async function saveObservation(input: ObservationInput) {
  const client = await ready();
  // Reuse the request ID on retry so an uncertain network response cannot create duplicates.
  const { data, error } = await client.from("observations").insert(input)
    .select(columns).single();
  if (error?.code === "23505") {
    const existing = await client.from("observations").select(columns).eq("id", input.id).single();
    if (existing.error) throw existing.error;
    return existing.data as Observation;
  }
  if (error) throw error;
  return data as Observation;
}
