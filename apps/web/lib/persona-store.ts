// Disk-backed persona store. Replaces the hardcoded `PERSONAS` /
// `PERSONA_META` from lib/personas.ts so the user can author N personas
// through the /personas/new builder.
//
// Layout under data/personas/:
//   <id>.json   metadata (label, tagline, glyph, color, createdAt)
//   <id>.yaml   goose recipe — single source of truth for tool subset +
//               instructions. Bind-mounted into spawned goose-runner
//               machines as /etc/goose-recipes:ro, so the file's basename
//               must match the GOOSE_RECIPE env var the orchestrator sets.
//
// On first read, seeds from the in-repo defaults at apps/goose-runner/
// recipes/ + a built-in metadata table for the original three personas.

import "server-only";
import fs from "node:fs";
import path from "node:path";

import YAML from "yaml";

import { DATA_PATHS } from "./data-paths";
import {
  type PersonaConfig,
  type SavePersonaInput,
  isValidId,
} from "./persona-types";

export type { PersonaConfig, SavePersonaInput };
export {
  COLOR_PALETTE,
  GLYPH_PALETTE,
  isValidId,
  slugify,
} from "./persona-types";

const DEFAULT_RECIPES_DIR = path.resolve(process.cwd(), "..", "goose-runner", "recipes");

const SEED: PersonaConfig[] = [
  {
    id: "research",
    label: "Research",
    tagline: "Search Exa / arXiv / GitHub / HF and store findings in a knowledge graph.",
    glyph: "◎",
    color: "oklch(0.78 0.13 200)",
    createdAt: "2026-04-28T00:00:00.000Z",
  },
  {
    id: "customer",
    label: "Customer",
    tagline: "Shop the catalog, manage a cart, place orders against the ecommerce backends.",
    glyph: "◇",
    color: "oklch(0.78 0.18 330)",
    createdAt: "2026-04-28T00:00:00.000Z",
  },
  {
    id: "merchandiser",
    label: "Merchandiser",
    tagline: "Watch inventory, talk to suppliers, raise restock purchase orders.",
    glyph: "△",
    color: "oklch(0.85 0.15 80)",
    createdAt: "2026-04-28T00:00:00.000Z",
  },
];

function ensureSeeded(): void {
  fs.mkdirSync(DATA_PATHS.personasDir, { recursive: true });
  for (const p of SEED) {
    const json = path.join(DATA_PATHS.personasDir, `${p.id}.json`);
    const yaml = path.join(DATA_PATHS.personasDir, `${p.id}.yaml`);
    if (!fs.existsSync(json)) {
      fs.writeFileSync(json, JSON.stringify(p, null, 2), "utf8");
    }
    if (!fs.existsSync(yaml)) {
      const src = path.join(DEFAULT_RECIPES_DIR, `${p.id}.yaml`);
      if (fs.existsSync(src)) fs.copyFileSync(src, yaml);
    }
  }
}

export function listPersonas(): PersonaConfig[] {
  ensureSeeded();
  const out: PersonaConfig[] = [];
  for (const file of fs.readdirSync(DATA_PATHS.personasDir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(DATA_PATHS.personasDir, file), "utf8");
      out.push(JSON.parse(raw) as PersonaConfig);
    } catch {
      // Skip corrupted entries — we don't want one bad file to break the index.
    }
  }
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

export function getPersona(id: string): PersonaConfig | null {
  ensureSeeded();
  const p = path.join(DATA_PATHS.personasDir, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as PersonaConfig;
  } catch {
    return null;
  }
}

export function personaExists(id: string): boolean {
  return getPersona(id) !== null;
}

export function recipePath(id: string): string {
  ensureSeeded();
  return path.join(DATA_PATHS.personasDir, `${id}.yaml`);
}

export function recipeExists(id: string): boolean {
  return fs.existsSync(recipePath(id));
}

export function readRecipe(id: string): Recipe {
  const raw = fs.readFileSync(recipePath(id), "utf8");
  return (YAML.parse(raw) ?? {}) as Recipe;
}

export function writeRecipe(id: string, recipe: Recipe): void {
  fs.writeFileSync(recipePath(id), YAML.stringify(recipe, { lineWidth: 120 }), "utf8");
}

export function getAvailableTools(id: string): string[] {
  if (!recipeExists(id)) return [];
  const r = readRecipe(id);
  return r.extensions?.[0]?.available_tools ?? [];
}

export function createPersona(input: SavePersonaInput): PersonaConfig {
  ensureSeeded();
  if (!isValidId(input.id)) {
    throw new Error(`invalid persona id: "${input.id}" (lowercase alphanumeric + hyphens, must start with a letter)`);
  }
  if (personaExists(input.id)) {
    throw new Error(`persona "${input.id}" already exists`);
  }

  const cfg: PersonaConfig = {
    id: input.id,
    label: input.label,
    tagline: input.tagline,
    glyph: input.glyph,
    color: input.color,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(DATA_PATHS.personasDir, `${cfg.id}.json`),
    JSON.stringify(cfg, null, 2),
    "utf8",
  );

  const recipe: Recipe = {
    version: "1.0.0",
    title: `${input.label} Goose`,
    description: input.tagline,
    parameters: [
      { key: "user_message", input_type: "string", requirement: "required", description: "The user's chat message for this turn" },
    ],
    prompt: "{{ user_message }}",
    instructions: input.instructions || `You are ${input.label}.`,
    extensions: [
      {
        type: "streamable_http",
        name: "agentgateway",
        uri: "http://gateway:3000/mcp",
        timeout: 60,
        description: "Virtual tools on agentgateway",
        available_tools: input.availableTools ?? [],
      },
    ],
  };
  writeRecipe(input.id, recipe);
  return cfg;
}

export function updatePersonaMeta(id: string, patch: Partial<Omit<PersonaConfig, "id" | "createdAt">>): PersonaConfig {
  const current = getPersona(id);
  if (!current) throw new Error(`persona "${id}" not found`);
  const next: PersonaConfig = { ...current, ...patch };
  fs.writeFileSync(
    path.join(DATA_PATHS.personasDir, `${id}.json`),
    JSON.stringify(next, null, 2),
    "utf8",
  );
  return next;
}

export function deletePersona(id: string): void {
  const json = path.join(DATA_PATHS.personasDir, `${id}.json`);
  const yaml = path.join(DATA_PATHS.personasDir, `${id}.yaml`);
  if (fs.existsSync(json)) fs.unlinkSync(json);
  if (fs.existsSync(yaml)) fs.unlinkSync(yaml);
}

export interface Recipe {
  version?: string;
  title?: string;
  description?: string;
  instructions?: string;
  prompt?: string;
  parameters?: unknown;
  extensions?: Array<{
    type?: string;
    name?: string;
    uri?: string;
    timeout?: number;
    description?: string;
    available_tools?: string[];
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}
