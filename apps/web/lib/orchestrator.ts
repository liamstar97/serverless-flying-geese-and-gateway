// Spawn-or-locate a goose-runner instance for a given (user, persona, session).
//
// LOCAL_GOOSE=1 path: shell out to `docker run` to spawn the container on the
// gloop network, with -P so docker assigns a random host port. We talk to the
// container from Next.js (running on the host) via that random port.
//
// On Fly (M5) this same module will switch to the Machines API instead of
// shelling out to docker.

import { spawn } from "node:child_process";

import type { Persona } from "./personas";
import { findSession, touchSession, upsertSession, deleteSession, listSessionsByUser } from "./sessions";
import { startSweeperOnce } from "./sweeper";
import { DOCKER_MOUNTS } from "./data-paths";
import { recipePath } from "./recipes";

const LOCAL = process.env.LOCAL_GOOSE === "1";
const NETWORK = process.env.GOOSE_DOCKER_NETWORK ?? "gloop";
const IMAGE = process.env.GOOSE_DOCKER_IMAGE ?? "serverless-flying-geese-and-gateway-goose-runner";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";

function exec(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

async function dockerExists(containerId: string): Promise<boolean> {
  if (!containerId) return false;
  const { code, stdout } = await exec("docker", ["inspect", "-f", "{{.State.Running}}", containerId]);
  return code === 0 && stdout.trim() === "true";
}

async function dockerStop(containerId: string): Promise<void> {
  await exec("docker", ["stop", "-t", "2", containerId]);
}

/**
 * Tear down every running goose-runner machine for `(userId, persona)` so
 * the next message respawns with whatever recipe is on disk now. Used by
 * the recipe editor when the user saves changes — without this, an in-flight
 * machine keeps serving the *previous* recipe until idle-swept.
 */
export async function recyclePersonaMachines(userId: string, persona: Persona): Promise<number> {
  const rows = listSessionsByUser(userId).filter((r) => r.persona === persona);
  let stopped = 0;
  for (const row of rows) {
    if (await dockerExists(row.container_id)) {
      await dockerStop(row.container_id);
      stopped++;
    }
    deleteSession(userId, persona, row.session_id);
  }
  return stopped;
}

function safeName(s: string): string {
  // docker container names: [a-zA-Z0-9][a-zA-Z0-9_.-]*, max 64 chars.
  return s.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 24);
}

async function dockerSpawn(
  persona: Persona,
  userId: string,
  sessionId: string,
): Promise<{ containerId: string; hostPort: number }> {
  if (!ANTHROPIC_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set in apps/web/.env.local");
  }
  const env = [
    "-e", `ANTHROPIC_API_KEY=${ANTHROPIC_KEY}`,
    "-e", "GOOSE_PROVIDER=anthropic",
    "-e", "GOOSE_MODEL=claude-sonnet-4-6",
    "-e", `GOOSE_RECIPE=${persona}`,
  ];
  // `goose-<persona>-<userId-prefix>-<sessionId-prefix>` — picks `docker ps`
  // out of the noise. + a short timestamp suffix to avoid name clashes if a
  // stale container with the same key still lingers.
  const name = `goose-${persona}-${safeName(userId)}-${safeName(sessionId)}-${Date.now() % 100000}`;
  // Touch the recipe so the seeded path exists on the host before mounting it
  // into the container.
  recipePath(persona);

  console.log(`[orchestrator] docker run --name=${name} --network=${NETWORK} ${IMAGE}`);
  const { stdout, stderr, code } = await exec("docker", [
    "run", "-d", "--rm",
    "--name", name,
    "--network", NETWORK,
    "-P",
    "-v", `${DOCKER_MOUNTS.recipesDir}:/etc/goose-recipes:ro`,
    ...env,
    IMAGE,
  ]);
  if (code !== 0) {
    throw new Error(`docker run failed: ${stderr.trim() || stdout.trim()}`);
  }
  const containerId = stdout.trim();
  console.log(`[orchestrator] spawned container ${containerId.slice(0, 12)}`);

  const portRes = await exec("docker", ["port", containerId, "8000/tcp"]);
  if (portRes.code !== 0) {
    throw new Error(`docker port failed: ${portRes.stderr.trim()}`);
  }
  const m = portRes.stdout.match(/:(\d+)/);
  if (!m) throw new Error(`could not parse host port from: ${portRes.stdout}`);
  const hostPort = parseInt(m[1], 10);
  console.log(`[orchestrator] container ${containerId.slice(0, 12)} -> host port ${hostPort}, waiting for /healthz`);

  // Wait for the wrapper to actually bind to :8000 inside the container.
  // Without this, the first WS connect races the uvicorn startup and sees
  // ECONNRESET (TCP arrives at the port-forwarder, container has nothing
  // listening yet). The image is small + warm-cached locally so this
  // typically resolves in <2s.
  await waitForHealthz(hostPort, 30_000);
  console.log(`[orchestrator] container ${containerId.slice(0, 12)} healthy`);

  return { containerId, hostPort };
}

async function waitForHealthz(hostPort: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "no response yet";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${hostPort}/healthz`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return;
      lastErr = `${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`goose-runner not healthy within ${timeoutMs}ms: ${lastErr}`);
}

export async function getOrSpawnGoose(
  userId: string,
  persona: Persona,
  sessionId: string,
): Promise<string /* ws url */> {
  if (!LOCAL) {
    throw new Error("Fly Machines API path not implemented yet (M5)");
  }
  startSweeperOnce();

  const existing = findSession(userId, persona, sessionId);
  if (existing && (await dockerExists(existing.container_id))) {
    touchSession(userId, persona, sessionId);
    return existing.ws_url;
  }
  if (existing) {
    // Stale row — container is gone. Drop it before respawning.
    deleteSession(userId, persona, sessionId);
  }

  const { containerId, hostPort } = await dockerSpawn(persona, userId, sessionId);
  const wsUrl = `ws://localhost:${hostPort}/chat`;
  upsertSession({
    user_id: userId,
    persona,
    session_id: sessionId,
    container_id: containerId,
    ws_url: wsUrl,
    last_used_at: Date.now(),
  });
  return wsUrl;
}
