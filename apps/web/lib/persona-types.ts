// Pure types + UI constants safe to import from client components.
// Anything that touches the filesystem lives in persona-store.ts (server-only).

export interface PersonaConfig {
  id: string;
  label: string;
  tagline: string;
  glyph: string;
  color: string;
  createdAt: string;
}

export const COLOR_PALETTE: { name: string; value: string }[] = [
  { name: "cyan",     value: "oklch(0.78 0.13 200)" },
  { name: "fuchsia",  value: "oklch(0.78 0.18 330)" },
  { name: "amber",    value: "oklch(0.85 0.15 80)"  },
  { name: "mint",     value: "oklch(0.78 0.13 165)" },
  { name: "violet",   value: "oklch(0.7 0.15 290)"  },
  { name: "coral",    value: "oklch(0.75 0.18 30)"  },
  { name: "rose",     value: "oklch(0.72 0.16 0)"   },
  { name: "indigo",   value: "oklch(0.66 0.15 260)" },
];

export const GLYPH_PALETTE = [
  "◎", "◇", "△", "○", "◆", "▲", "▽", "⬡", "⬢", "⌬", "⊕", "⊗", "❉", "❋", "❖", "✦",
];

const VALID_ID = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;

export function isValidId(id: string): boolean {
  return VALID_ID.test(id);
}

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export interface SavePersonaInput {
  id: string;
  label: string;
  tagline: string;
  glyph: string;
  color: string;
  instructions: string;
  availableTools?: string[];
}
