// The three goose personas — these match the recipe filenames in
// data/goose-recipes/<persona>.yaml (mounted into spawned goose-runner
// machines). Per-persona accent var matches what's defined in globals.css
// — referenced as Tailwind class `bg-persona-research` etc.

export const PERSONAS = ["research", "customer", "merchandiser"] as const;
export type Persona = (typeof PERSONAS)[number];

export function isPersona(s: string): s is Persona {
  return (PERSONAS as readonly string[]).includes(s);
}

export interface PersonaMeta {
  label: string;
  tagline: string;
  /** Tailwind class fragment for the per-persona accent (use as `text-${accent}`, `bg-${accent}/20`, …). */
  accent: "persona-research" | "persona-customer" | "persona-merchandiser";
  /** A single emoji-ish glyph used as the persona's mark. */
  glyph: string;
}

export const PERSONA_META: Record<Persona, PersonaMeta> = {
  research: {
    label: "Research",
    tagline: "Search Exa / arXiv / GitHub / HF and store findings in a knowledge graph.",
    accent: "persona-research",
    glyph: "◎",
  },
  customer: {
    label: "Customer",
    tagline: "Shop the catalog, manage a cart, place orders against the ecommerce backends.",
    accent: "persona-customer",
    glyph: "◇",
  },
  merchandiser: {
    label: "Merchandiser",
    tagline: "Watch inventory, talk to suppliers, raise restock purchase orders.",
    accent: "persona-merchandiser",
    glyph: "△",
  },
};
