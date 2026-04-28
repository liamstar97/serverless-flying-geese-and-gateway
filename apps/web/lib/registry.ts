// Read/write the gateway's merged virtual-tool registry.
//
// The registry file is bind-mounted into the agentgateway container at
// /etc/agentgateway/registry.json. The gateway's `refreshInterval: 30s`
// means saves take effect within ~30s without restart.
//
// First read seeds the file from the upstream demos via merge_registries.py
// (run as a subprocess) — same merge step the gateway image used to do
// at build time. After that, this file is the source of truth.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { DATA_PATHS } from "./data-paths";

const SUBMODULE = path.resolve(process.cwd(), "..", "..", "vendor", "agentgatewaygastown");
const RESEARCH_REG = path.join(SUBMODULE, "examples/research-assistant-demo/gateway-configs/research_registry.json");
const ECOMMERCE_REG = path.join(SUBMODULE, "examples/ecommerce-demo/gateway-configs/ecommerce_registry_v2.json");
const MERGE_SCRIPT = path.resolve(process.cwd(), "..", "gateway", "merge_registries.py");

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

function ensureSeeded(): void {
  fs.mkdirSync(path.dirname(DATA_PATHS.registry), { recursive: true });
  if (fs.existsSync(DATA_PATHS.registry)) return;
  const r = spawnSync("python3", [MERGE_SCRIPT, RESEARCH_REG, ECOMMERCE_REG, DATA_PATHS.registry], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`merge_registries.py failed: ${r.stderr || r.stdout}`);
  }
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
}

export function writeRegistryText(text: string): void {
  // Validate JSON before writing.
  JSON.parse(text);
  fs.writeFileSync(DATA_PATHS.registry, text, "utf8");
}
