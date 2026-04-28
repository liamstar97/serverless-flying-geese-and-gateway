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
import { findSession, touchSession, upsertSession, deleteSession } from "./sessions";

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

async function dockerSpawn(persona: Persona): Promise<{ containerId: string; hostPort: number }> {
  if (!ANTHROPIC_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set in apps/web/.env.local");
  }
  const env = [
    "-e", `ANTHROPIC_API_KEY=${ANTHROPIC_KEY}`,
    "-e", "GOOSE_PROVIDER=anthropic",
    "-e", "GOOSE_MODEL=claude-sonnet-4-6",
    "-e", `GOOSE_RECIPE=${persona}`,
  ];
  console.log(`[orchestrator] docker run --network=${NETWORK} ${IMAGE} (persona=${persona})`);
  const { stdout, stderr, code } = await exec("docker", [
    "run", "-d", "--rm",
    "--network", NETWORK,
    "-P",
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
  console.log(`[orchestrator] container ${containerId.slice(0, 12)} -> host port ${hostPort}`);
  return { containerId, hostPort };
}

export async function getOrSpawnGoose(
  userId: string,
  persona: Persona,
  sessionId: string,
): Promise<string /* ws url */> {
  if (!LOCAL) {
    throw new Error("Fly Machines API path not implemented yet (M5)");
  }

  const existing = findSession(userId, persona, sessionId);
  if (existing && (await dockerExists(existing.container_id))) {
    touchSession(userId, persona, sessionId);
    return existing.ws_url;
  }
  if (existing) {
    // Stale row — container is gone. Drop it before respawning.
    deleteSession(userId, persona, sessionId);
  }

  const { containerId, hostPort } = await dockerSpawn(persona);
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
