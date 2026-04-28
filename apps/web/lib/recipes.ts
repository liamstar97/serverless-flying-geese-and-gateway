// Read/write goose recipe YAML files. The first call seeds the data
// directory from the in-repo defaults at apps/goose-runner/recipes/.
//
// We parse a recipe's `extensions[0].available_tools` to drive the
// per-persona tool curator UI; on save, we write back YAML preserving
// other fields verbatim.

import fs from "node:fs";
import path from "node:path";

import YAML from "yaml";

import { DATA_PATHS } from "./data-paths";
import type { Persona } from "./personas";
import { PERSONAS } from "./personas";

const DEFAULT_DIR = path.resolve(process.cwd(), "..", "goose-runner", "recipes");

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

function ensureSeeded(): void {
  fs.mkdirSync(DATA_PATHS.recipesDir, { recursive: true });
  for (const p of PERSONAS) {
    const dst = path.join(DATA_PATHS.recipesDir, `${p}.yaml`);
    if (fs.existsSync(dst)) continue;
    const src = path.join(DEFAULT_DIR, `${p}.yaml`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }
}

export function recipePath(persona: Persona): string {
  ensureSeeded();
  return path.join(DATA_PATHS.recipesDir, `${persona}.yaml`);
}

export function readRecipe(persona: Persona): Recipe {
  const raw = fs.readFileSync(recipePath(persona), "utf8");
  return (YAML.parse(raw) ?? {}) as Recipe;
}

export function readRecipeText(persona: Persona): string {
  return fs.readFileSync(recipePath(persona), "utf8");
}

export function writeRecipe(persona: Persona, recipe: Recipe): void {
  const text = YAML.stringify(recipe, { lineWidth: 120 });
  fs.writeFileSync(recipePath(persona), text, "utf8");
}

export function getAvailableTools(persona: Persona): string[] {
  const r = readRecipe(persona);
  return r.extensions?.[0]?.available_tools ?? [];
}

export function setAvailableTools(persona: Persona, tools: string[]): void {
  const r = readRecipe(persona);
  if (!r.extensions || r.extensions.length === 0) {
    r.extensions = [
      { type: "streamable_http", name: "agentgateway", uri: "http://gateway:3000/mcp", timeout: 60 },
    ];
  }
  r.extensions[0].available_tools = [...new Set(tools)].sort();
  writeRecipe(persona, r);
}
