import { createClient } from "@/lib/supabase/client";

export type Observation = {
  id: string;
  author_id: string;
  team_id: string | null;
  version: number;
  updated_at: string | null;
  updated_by: string | null;
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
  team_id?: string;
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

const columns = "id,author_id,team_id,version,updated_at,updated_by,resident_id,meal_period,meal,water,bowel,walking,urination,pain,skin,sleep,mood,cognition,communication,hygiene,oral_care,medication,activity,emotional_support,created_at";

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
export async function listObservations(teamId?: string) {
  const client = await ready();
  const query = client.from("observations").select(columns);
  const scoped = teamId ? query.eq("team_id", teamId) : query.is("team_id", null);
  const { data, error } = await scoped.order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return data as Observation[];
}
export async function saveObservation(input: ObservationInput) {
  const client = await ready();
  const { data, error } = await client.rpc("create_observation", { p_input: input }).single<Observation>();
  if (error) throw error;
  return data;
}

export type ObservationChanges = Partial<Omit<ObservationInput, "id" | "team_id" | "resident_id">>;
export type ObservationRevision = {
  observation_id: string;
  version: number;
  action: "baseline" | "create" | "update";
  actor_id: string | null;
  recorded_at: string;
  request_id: string | null;
  snapshot: Observation;
};

export async function updateObservation(input: {
  id: string;
  request_id: string;
  expected_version: number;
  changes: ObservationChanges;
}) {
  const client = await ready();
  const { data, error } = await client.rpc("update_observation", {
    p_id: input.id,
    p_request_id: input.request_id,
    p_expected_version: input.expected_version,
    p_changes: input.changes,
  }).single<Observation>();
  if (error) throw error;
  return data;
}

export async function listObservationRevisions(observationId: string) {
  const client = await ready();
  // shortcut: follows the project's REST max_rows; add paging before long-running histories exceed it.
  const { data, error } = await client.from("observation_revisions")
    .select("observation_id,version,action,actor_id,recorded_at,request_id,snapshot")
    .eq("observation_id", observationId).order("version", { ascending: false });
  if (error) throw error;
  return data as ObservationRevision[];
}
