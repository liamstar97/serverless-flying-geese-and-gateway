// Idle sweeper: every minute, find sessions whose last_used_at is older
// than GOOSE_IDLE_MINUTES and stop+destroy their goose-runner container.
// Local: `docker stop`. Fly: POST machines/{id}/stop + DELETE.
//
// The actual stop logic is owned by the orchestrator's recyclePersonaMachines,
// but we don't want to touch *all* a user's sessions when sweeping — only
// the idle ones. So this module talks to the same APIs directly.

import { spawn } from "node:child_process";

import { listIdleSessions, deleteSession } from "./sessions";
import { isContainerRunning } from "./orchestrator";

const IDLE_MINUTES = parseInt(process.env.GOOSE_IDLE_MINUTES ?? "5", 10);
const LOCAL = process.env.LOCAL_GOOSE !== "0";

const FLY_API = process.env.FLY_MACHINES_API ?? "https://api.machines.dev";
const FLY_TOKEN = process.env.FLY_API_TOKEN ?? "";
const FLY_GOOSE_APP = process.env.FLY_GOOSE_APP ?? "";

let started = false;

function dockerStop(containerId: string): Promise<void> {
  return new Promise((resolve) => {
    const p = spawn("docker", ["stop", "-t", "2", containerId]);
    p.on("close", () => resolve());
  });
}

async function flyDestroy(machineId: string): Promise<void> {
  if (!FLY_TOKEN || !FLY_GOOSE_APP) return;
  const headers = { authorization: `Bearer ${FLY_TOKEN}` };
  try { await fetch(`${FLY_API}/v1/apps/${FLY_GOOSE_APP}/machines/${machineId}/stop`, { method: "POST", headers }); } catch {}
  try { await fetch(`${FLY_API}/v1/apps/${FLY_GOOSE_APP}/machines/${machineId}?force=true`, { method: "DELETE", headers }); } catch {}
}

async function sweep(): Promise<void> {
  const stale = listIdleSessions(IDLE_MINUTES * 60 * 1000);
  if (stale.length === 0) return;
  console.log(`[sweeper] reaping ${stale.length} idle goose container(s) (>${IDLE_MINUTES}m)`);
  for (const row of stale) {
    if (await isContainerRunning(row.container_id)) {
      if (LOCAL) await dockerStop(row.container_id);
      else await flyDestroy(row.container_id);
    }
    deleteSession(row.user_id, row.persona, row.session_id);
  }
}

export function startSweeperOnce(): void {
  if (started) return;
  started = true;
  setTimeout(() => {
    sweep().catch((e) => console.error("[sweeper]", e));
    setInterval(() => {
      sweep().catch((e) => console.error("[sweeper]", e));
    }, 60_000);
  }, 30_000);
  console.log(`[sweeper] armed; idle threshold ${IDLE_MINUTES}m; mode=${LOCAL ? "docker" : "fly"}`);
}
