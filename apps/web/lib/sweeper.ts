// Idle sweeper: every minute, find sessions whose last_used_at is older
// than GOOSE_IDLE_MINUTES and stop their goose-runner container. We rely on
// `docker run --rm` to actually remove them after stop.
//
// Local-only for now (LOCAL_GOOSE=1). On Fly (M5) the same idea will
// translate to `POST /v1/apps/.../machines/{id}/stop` calls.

import { spawn } from "node:child_process";

import { listIdleSessions, deleteSession } from "./sessions";

const IDLE_MINUTES = parseInt(process.env.GOOSE_IDLE_MINUTES ?? "5", 10);
const LOCAL = process.env.LOCAL_GOOSE === "1";

let started = false;

function dockerStop(containerId: string): Promise<void> {
  return new Promise((resolve) => {
    const p = spawn("docker", ["stop", "-t", "2", containerId]);
    p.on("close", () => resolve());
  });
}

async function sweep(): Promise<void> {
  const stale = listIdleSessions(IDLE_MINUTES * 60 * 1000);
  if (stale.length === 0) return;
  console.log(`[sweeper] stopping ${stale.length} idle goose container(s) (>${IDLE_MINUTES}m)`);
  for (const row of stale) {
    if (LOCAL) await dockerStop(row.container_id);
    deleteSession(row.user_id, row.persona, row.session_id);
  }
}

export function startSweeperOnce(): void {
  if (started) return;
  started = true;
  // Stagger initial run so we don't sweep mid-spawn during dev hot-reloads.
  setTimeout(() => {
    sweep().catch((e) => console.error("[sweeper]", e));
    setInterval(() => {
      sweep().catch((e) => console.error("[sweeper]", e));
    }, 60_000);
  }, 30_000);
  console.log(`[sweeper] armed; idle threshold ${IDLE_MINUTES}m`);
}
