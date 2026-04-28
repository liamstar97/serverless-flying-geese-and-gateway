// Spawn-or-locate a goose-runner instance for a given (user, persona, session).
//
// Two backends share one interface:
//   - LOCAL_GOOSE=1: shell out to `docker run` against the local daemon.
//     Used in dev. Random host port, talked to via `localhost:<port>`.
//   - LOCAL_GOOSE=0 (production on Fly): POST /v1/apps/<app>/machines
//     against api.machines.dev. Each machine has a 6PN private DNS name
//     `<id>.vm.<app>.internal` reachable from the web app's container.

import { spawn } from "node:child_process";

import type { Persona } from "./personas";
import { findSession, touchSession, upsertSession, deleteSession, listSessionsByUser } from "./sessions";
import { startSweeperOnce } from "./sweeper";
import { DOCKER_MOUNTS } from "./data-paths";
import { recipePath, getPersona } from "./persona-store";

const LOCAL = process.env.LOCAL_GOOSE !== "0";
const NETWORK = process.env.GOOSE_DOCKER_NETWORK ?? "gloop";
const IMAGE = process.env.GOOSE_DOCKER_IMAGE ?? "serverless-flying-geese-and-gateway-goose-runner";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const FLY_API = process.env.FLY_MACHINES_API ?? "https://api.machines.dev";
const FLY_TOKEN = process.env.FLY_API_TOKEN ?? "";
const FLY_GOOSE_APP = process.env.FLY_GOOSE_APP ?? "";
const FLY_GOOSE_REGION = process.env.FLY_GOOSE_REGION ?? "sea";
const FLY_GOOSE_IMAGE = process.env.FLY_GOOSE_IMAGE ?? "";
const GATEWAY_URL_INTERNAL = process.env.GATEWAY_URL ?? "http://gateway:3000";

// ───────── shared util ─────────

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

async function waitForHealthz(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "no response yet";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
      lastErr = `${res.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`goose-runner not healthy within ${timeoutMs}ms: ${lastErr}`);
}

// Cold-start budget for a freshly-spawned Fly Machine. Image pull (first
// time) + uvicorn + module imports comfortably runs > 30s on Fly's
// shared-cpu, especially in regions where the goose-runner image isn't
// yet cached. Be generous — this is the single biggest UX delay on the
// first message after a long idle.
const SPAWN_HEALTHZ_TIMEOUT_MS = 90_000;

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 24);
}

// ───────── docker (local dev) ─────────

async function dockerExists(containerId: string): Promise<boolean> {
  if (!containerId) return false;
  const { code, stdout } = await exec("docker", ["inspect", "-f", "{{.State.Running}}", containerId]);
  return code === 0 && stdout.trim() === "true";
}

async function dockerStop(containerId: string): Promise<void> {
  await exec("docker", ["stop", "-t", "2", containerId]);
}

async function dockerSpawn(
  persona: Persona,
  userId: string,
  sessionId: string,
): Promise<{ id: string; wsUrl: string }> {
  if (!ANTHROPIC_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set in apps/web/.env.local");
  }
  const env = [
    "-e", `ANTHROPIC_API_KEY=${ANTHROPIC_KEY}`,
    "-e", "GOOSE_PROVIDER=anthropic",
    "-e", "GOOSE_MODEL=claude-sonnet-4-6",
    "-e", `GOOSE_RECIPE=${persona}`,
  ];
  const name = `goose-${persona}-${safeName(userId)}-${safeName(sessionId)}-${Date.now() % 100000}`;
  recipePath(persona);

  console.log(`[orch.docker] spawn name=${name} network=${NETWORK} image=${IMAGE}`);
  const { stdout, stderr, code } = await exec("docker", [
    "run", "-d", "--rm",
    "--name", name,
    "--network", NETWORK,
    "-P",
    "-v", `${DOCKER_MOUNTS.recipesDir}:/etc/goose-recipes:ro`,
    ...env,
    IMAGE,
  ]);
  if (code !== 0) throw new Error(`docker run failed: ${stderr.trim() || stdout.trim()}`);
  const id = stdout.trim();

  const portRes = await exec("docker", ["port", id, "8000/tcp"]);
  if (portRes.code !== 0) throw new Error(`docker port failed: ${portRes.stderr.trim()}`);
  const m = portRes.stdout.match(/:(\d+)/);
  if (!m) throw new Error(`could not parse host port: ${portRes.stdout}`);
  const port = parseInt(m[1], 10);

  await waitForHealthz(`http://localhost:${port}/healthz`, SPAWN_HEALTHZ_TIMEOUT_MS);
  return { id, wsUrl: `ws://localhost:${port}/chat` };
}

// ───────── fly machines (production) ─────────

interface FlyMachine {
  id: string;
  name: string;
  state: string;
  private_ip?: string;
  config?: { image?: string };
}

async function flyApi<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!FLY_TOKEN) throw new Error("FLY_API_TOKEN not set");
  const res = await fetch(`${FLY_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${FLY_TOKEN}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`fly ${method} ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function flyGetMachine(id: string): Promise<FlyMachine | null> {
  if (!FLY_GOOSE_APP) throw new Error("FLY_GOOSE_APP not set");
  try {
    return await flyApi<FlyMachine>("GET", `/v1/apps/${FLY_GOOSE_APP}/machines/${id}`);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("404") || msg.includes("not_found")) return null;
    throw e;
  }
}

async function flyMachineRunning(id: string): Promise<boolean> {
  const m = await flyGetMachine(id);
  return !!m && (m.state === "started" || m.state === "starting");
}

async function flyDestroyMachine(id: string): Promise<void> {
  if (!FLY_GOOSE_APP) return;
  try {
    await flyApi("POST", `/v1/apps/${FLY_GOOSE_APP}/machines/${id}/stop`);
  } catch { /* may already be stopped */ }
  try {
    await flyApi("DELETE", `/v1/apps/${FLY_GOOSE_APP}/machines/${id}?force=true`);
  } catch { /* idempotent */ }
}

async function flySpawn(
  persona: Persona,
  userId: string,
  sessionId: string,
): Promise<{ id: string; wsUrl: string }> {
  if (!FLY_GOOSE_APP) throw new Error("FLY_GOOSE_APP not set");
  if (!FLY_GOOSE_IMAGE) throw new Error("FLY_GOOSE_IMAGE not set — fly deploy --build-only and set the digest");
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not set as a Fly secret on the web app");

  recipePath(persona); // warm the recipe file on the web volume; the goose
                       // machine reads it via the shared volume mount below.

  const name = `goose-${persona}-${safeName(userId)}-${safeName(sessionId)}-${Date.now() % 100000}`;
  console.log(`[orch.fly] spawn name=${name} app=${FLY_GOOSE_APP} region=${FLY_GOOSE_REGION}`);

  // The recipes volume must be a per-machine readonly mount of the web
  // app's data dir. On Fly, volumes are per-app, so the goose-runner app
  // gets its own volume that we sync from the web app on every recipe save.
  // (TODO: replace with a tiny shared object store / Tigris bucket if this
  // sync becomes a bottleneck.)
  const machine = await flyApi<FlyMachine>(
    "POST",
    `/v1/apps/${FLY_GOOSE_APP}/machines`,
    {
      name,
      region: FLY_GOOSE_REGION,
      config: {
        image: FLY_GOOSE_IMAGE,
        auto_destroy: true,
        restart: { policy: "no" },
        env: {
          ANTHROPIC_API_KEY: ANTHROPIC_KEY,
          GOOSE_PROVIDER: "anthropic",
          GOOSE_MODEL: "claude-sonnet-4-6",
          GOOSE_RECIPE: persona,
          GATEWAY_URL: GATEWAY_URL_INTERNAL,
        },
        services: [
          {
            ports: [{ port: 8000 }],
            protocol: "tcp",
            internal_port: 8000,
          },
        ],
        guest: { cpu_kind: "shared", cpus: 1, memory_mb: 1024 },
        // Recipes for the 3 default personas are baked into the goose-runner
        // image at /etc/goose-recipes/, so no volume mount is required.
        // Live editing of personas via /personas/[id] needs a recipe-sync
        // mechanism that's a separate follow-up — Fly Volumes can't be
        // shared across apps, and the API expects volume IDs (UUIDs)
        // anyway, so just naming a volume here returns 400.
        metadata: { persona, userId, sessionId },
      },
    },
  );

  const wsUrl = `ws://${machine.id}.vm.${FLY_GOOSE_APP}.internal:8000/chat`;
  await waitForHealthz(
    `http://${machine.id}.vm.${FLY_GOOSE_APP}.internal:8000/healthz`,
    SPAWN_HEALTHZ_TIMEOUT_MS,
  );
  return { id: machine.id, wsUrl };
}

// ───────── public surface ─────────

/** Used by the live-status API and home page to decide warm/cold. */
export async function isContainerRunning(id: string): Promise<boolean> {
  if (LOCAL) return dockerExists(id);
  return flyMachineRunning(id);
}

/** Stop + drop session rows for every (userId, persona) machine. */
export async function recyclePersonaMachines(userId: string, persona: Persona): Promise<number> {
  const rows = listSessionsByUser(userId).filter((r) => r.persona === persona);
  let stopped = 0;
  for (const row of rows) {
    if (LOCAL) {
      if (await dockerExists(row.container_id)) { await dockerStop(row.container_id); stopped++; }
    } else {
      if (await flyMachineRunning(row.container_id)) { await flyDestroyMachine(row.container_id); stopped++; }
    }
    deleteSession(userId, persona, row.session_id);
  }
  return stopped;
}

/** Idempotent locate-or-spawn keyed on the session triple. */
export async function getOrSpawnGoose(
  userId: string,
  persona: Persona,
  sessionId: string,
): Promise<string /* ws url */> {
  if (!getPersona(persona)) throw new Error(`unknown persona: ${persona}`);
  startSweeperOnce();

  const existing = findSession(userId, persona, sessionId);
  if (existing && (await isContainerRunning(existing.container_id))) {
    touchSession(userId, persona, sessionId);
    return existing.ws_url;
  }
  if (existing) deleteSession(userId, persona, sessionId);

  const spawned = LOCAL
    ? await dockerSpawn(persona, userId, sessionId)
    : await flySpawn(persona, userId, sessionId);

  upsertSession({
    user_id: userId,
    persona,
    session_id: sessionId,
    container_id: spawned.id,
    ws_url: spawned.wsUrl,
    last_used_at: Date.now(),
  });
  return spawned.wsUrl;
}
