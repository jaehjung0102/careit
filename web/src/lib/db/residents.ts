import { createClient } from "@/lib/supabase/client";

export type Resident = { id: string; team_id: string; name: string; room: string };
export type TeamMembership = {
  team_id: string;
  role: "admin" | "caregiver";
  teams: { name: string };
};

export async function loadTeamDirectory() {
  const client = createClient();
  const [memberships, residents] = await Promise.all([
    client.from("team_memberships").select("team_id,role,teams(name)")
      .order("team_id").returns<TeamMembership[]>(),
    client.from("residents").select("id,team_id,name,room").order("name")
      .returns<Resident[]>(),
  ]);
  if (memberships.error) throw memberships.error;
  if (residents.error) throw residents.error;
  return { memberships: memberships.data, residents: residents.data };
}
