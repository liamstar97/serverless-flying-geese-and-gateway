// The three goose personas — these match the recipe filenames in
// apps/goose-runner/recipes/<persona>.yaml. M4 ships only `research`;
// `customer` and `merchandiser` recipes land in M6.

export const PERSONAS = ["research", "customer", "merchandiser"] as const;
export type Persona = (typeof PERSONAS)[number];

export function isPersona(s: string): s is Persona {
  return (PERSONAS as readonly string[]).includes(s);
}

export const PERSONA_META: Record<Persona, { label: string; tagline: string }> = {
  research: {
    label: "Research",
    tagline: "Search Exa / arXiv / GitHub / HF and store findings in a knowledge graph",
  },
  customer: {
    label: "Customer",
    tagline: "Shop the catalog, manage your cart, place orders",
  },
  merchandiser: {
    label: "Merchandiser",
    tagline: "Watch inventory, talk to suppliers, raise restock POs",
  },
};
