// Read/write the gateway's merged virtual-tool registry.
//
// On first read, seeds /data/gateway/registry.json by merging the two
// upstream registry JSONs that ship with the web image (apps/web/seeds/).
// Same merge logic as apps/gateway/merge_registries.py — implemented in
// TS here so the web container doesn't need a python3 install.
//
// Production caveat: the live registry the *gateway* is serving lives on
// the gateway's own Volume. The /registry editor writes to the web app's
// volume, which the gateway can't see. For real prod editing we need a
// sync mechanism (e.g. push to a Tigris bucket the gateway pulls from).

import "server-only";
import fs from "node:fs";
import path from "node:path";

import { DATA_PATHS } from "./data-paths";

// Both candidate locations for the upstream JSONs:
//   - dev (running `next dev` from apps/web): vendored at the repo root
//   - prod (web container): copied to /app/seeds at build time
const SEED_CANDIDATES = [
  path.resolve(process.cwd(), "..", "..", "vendor", "agentgatewaygastown", "examples", "research-assistant-demo", "gateway-configs", "research_registry.json"),
  path.resolve(process.cwd(), "seeds", "research_registry.json"),
];
const ECOM_CANDIDATES = [
  path.resolve(process.cwd(), "..", "..", "vendor", "agentgatewaygastown", "examples", "ecommerce-demo", "gateway-configs", "ecommerce_registry_v2.json"),
  path.resolve(process.cwd(), "seeds", "ecommerce_registry_v2.json"),
];

function findSeed(candidates: string[]): string | null {
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

export interface ToolDef {
  name: string;
  description?: string;
  source?: unknown;
  spec?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
  outputTransform?: unknown;
  [k: string]: unknown;
}

export interface Registry {
  schemaVersion?: string;
  description?: string;
  schemas?: unknown[];
  servers?: unknown[];
  tools?: ToolDef[];
  agents?: unknown[];
  [k: string]: unknown;
}

interface NamedThing { name?: string }

function names(items: unknown[] | undefined): Set<string> {
  return new Set((items ?? []).map((x) => (x as NamedThing).name).filter((n): n is string => !!n));
}

function mergeRegistries(research: Registry, ecommerce: Registry): Registry {
  for (const section of ["schemas", "servers", "tools"] as const) {
    const overlap = [...names(research[section] as unknown[])].filter((n) =>
      names(ecommerce[section] as unknown[]).has(n),
    );
    if (overlap.length > 0) {
      throw new Error(`name collision in ${section}: ${overlap.join(", ")}`);
    }
  }
  return {
    schemaVersion: "2.0",
    description: "Merged registry: research-assistant + ecommerce demos",
    schemas: [...(research.schemas ?? []), ...(ecommerce.schemas ?? [])],
    servers: [...(research.servers ?? []), ...(ecommerce.servers ?? [])],
    tools: [...(research.tools ?? []), ...(ecommerce.tools ?? [])],
    agents: ecommerce.agents ?? [],
  };
}

function ensureSeeded(): void {
  fs.mkdirSync(path.dirname(DATA_PATHS.registry), { recursive: true });
  if (fs.existsSync(DATA_PATHS.registry)) return;

  const researchPath = findSeed(SEED_CANDIDATES);
  const ecomPath = findSeed(ECOM_CANDIDATES);
  if (!researchPath || !ecomPath) {
    throw new Error(
      `registry seed sources not found. checked:\n  research: ${SEED_CANDIDATES.join(", ")}\n  ecommerce: ${ECOM_CANDIDATES.join(", ")}`,
    );
  }
  const research = JSON.parse(fs.readFileSync(researchPath, "utf8")) as Registry;
  const ecommerce = JSON.parse(fs.readFileSync(ecomPath, "utf8")) as Registry;
  const merged = mergeRegistries(research, ecommerce);
  fs.writeFileSync(DATA_PATHS.registry, JSON.stringify(merged, null, 2));
}

export function readRegistry(): Registry {
  ensureSeeded();
  return JSON.parse(fs.readFileSync(DATA_PATHS.registry, "utf8")) as Registry;
}

export function readRegistryText(): string {
  ensureSeeded();
  return fs.readFileSync(DATA_PATHS.registry, "utf8");
}

export function writeRegistry(reg: Registry): void {
  fs.writeFileSync(DATA_PATHS.registry, JSON.stringify(reg, null, 2), "utf8");
  void pushToGateway(reg);
}

export function writeRegistryText(text: string): void {
  // Validate JSON before writing.
  const parsed = JSON.parse(text);
  fs.writeFileSync(DATA_PATHS.registry, text, "utf8");
  void pushToGateway(parsed);
}

/**
 * Push the registry to the gateway's sync sidecar so its
 * `refreshInterval` picks it up. Best-effort: a failure here doesn't
 * fail the user's save (the local copy is the source of truth and we
 * can re-push later).
 */
async function pushToGateway(reg: Registry): Promise<void> {
  const url = process.env.GATEWAY_SYNC_URL;
  const secret = process.env.SYNC_SECRET;
  if (!url || !secret) return; // local dev: skip
  try {
    const res = await fetch(`${url}/registry`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sync-secret": secret },
      body: JSON.stringify(reg),
    });
    if (!res.ok) {
      console.warn(`[registry-sync] push failed: ${res.status} ${await res.text()}`);
    } else {
      console.log("[registry-sync] pushed to gateway");
    }
  } catch (e) {
    console.warn(`[registry-sync] push errored: ${(e as Error).message}`);
  }
}
