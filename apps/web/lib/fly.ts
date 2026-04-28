// Tiny Fly Machines API client + wake helpers. Reused by the orchestrator
// (for goose-runner spawns) and by lib/gateway.ts (so /tools and /registry
// don't ENOTFOUND when the gateway machine is asleep).
//
// Why a wake step at all: when a Fly app has zero started machines, the
// `<app>.internal` private-DNS name resolves to nothing — fetch() fails
// at DNS, before the proxy could intercept and auto-start. The fix is
// to ask the Machines API to start at least one machine first.

import "server-only";

const FLY_API = process.env.FLY_MACHINES_API ?? "https://api.machines.dev";
const FLY_TOKEN = process.env.FLY_API_TOKEN ?? "";

interface FlyMachine {
  id: string;
  name: string;
  state: string;
  region?: string;
  config?: { image?: string };
}

export async function flyApi<T = unknown>(
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

export async function listMachines(app: string): Promise<FlyMachine[]> {
  return flyApi<FlyMachine[]>("GET", `/v1/apps/${app}/machines`);
}

export async function getMachine(app: string, id: string): Promise<FlyMachine | null> {
  try {
    return await flyApi<FlyMachine>("GET", `/v1/apps/${app}/machines/${id}`);
  } catch (e) {
    if ((e as Error).message.includes("404")) return null;
    throw e;
  }
}

export async function startMachine(app: string, id: string): Promise<void> {
  await flyApi("POST", `/v1/apps/${app}/machines/${id}/start`);
}

export async function waitForMachineState(
  app: string,
  id: string,
  desired: "started" | "stopped",
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const m = await getMachine(app, id);
    if (m && m.state === desired) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`machine ${id} did not reach state=${desired} within ${timeoutMs}ms`);
}

/**
 * Ensure at least one machine of `app` is in the started state. Idempotent —
 * if a machine is already started, no-op. If all are stopped, start one
 * (the most recently updated, on the assumption it's the freshest deploy).
 *
 * Doesn't wait for the app's services to be *healthy* — just for the machine
 * to be in `started` state per Fly's API. Callers should retry their actual
 * request a few times to absorb cold-start.
 */
export async function wakeApp(app: string): Promise<void> {
  const machines = await listMachines(app);
  if (machines.length === 0) return; // nothing to wake
  if (machines.some((m) => m.state === "started" || m.state === "starting")) return;
  // Pick a stopped machine to wake.
  const target = machines.find((m) => m.state === "stopped") ?? machines[0];
  console.log(`[fly] waking ${app} -> machine ${target.id.slice(0, 12)}`);
  await startMachine(app, target.id);
  await waitForMachineState(app, target.id, "started", 30_000);
}
