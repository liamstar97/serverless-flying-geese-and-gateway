// Re-exports from the disk-backed persona store. Personas are now dynamic
// (created via /personas/new) so this file is a thin facade — the only
// thing the type system can say is that a persona id is a string.

export type Persona = string;
export {
  type PersonaConfig,
  COLOR_PALETTE,
  GLYPH_PALETTE,
  isValidId,
  slugify,
  listPersonas,
  getPersona,
  personaExists,
  recipePath,
  recipeExists,
  readRecipe,
  writeRecipe,
  getAvailableTools,
  createPersona,
  updatePersonaMeta,
  deletePersona,
  type Recipe,
  type SavePersonaInput,
} from "./persona-store";
