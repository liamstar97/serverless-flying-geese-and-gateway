// GET /api/personas/live -> { live: string[] }
//
// Returns the persona ids that currently have at least one *actually
// running* goose-runner container for the signed-in user. We can't trust
// just the sessions.db row presence, because a row can outlive its
// container if the dev process was killed mid-flight or someone
// `docker stop`'d a machine outside the sweeper.

import { auth } from "@/auth";
import { listSessionsByUser } from "@/lib/sessions";
import { isContainerRunning } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ live: [] }, { status: 200 });

  const userId = (session.user as { id?: string }).id ?? session.user.email ?? "anon";
  const rows = listSessionsByUser(userId);
  const live = new Set<string>();
  await Promise.all(
    rows.map(async (r) => {
      if (await isContainerRunning(r.container_id)) live.add(r.persona);
    }),
  );
  return Response.json({ live: [...live] });
}
