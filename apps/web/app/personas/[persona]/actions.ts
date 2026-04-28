"use server";

import { auth } from "@/auth";
import { isPersona, type Persona } from "@/lib/personas";
import { readRecipe, writeRecipe } from "@/lib/recipes";
import { recyclePersonaMachines } from "@/lib/orchestrator";

export async function savePersonaAction(input: {
  persona: Persona;
  tools: string[];
  instructions: string;
}): Promise<{ ok?: true; warm?: number; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "not signed in" };
  if (!isPersona(input.persona)) return { error: "unknown persona" };

  const userId = (session.user as { id?: string }).id ?? session.user.email ?? "anon";

  try {
    const recipe = readRecipe(input.persona);
    if (!recipe.extensions || recipe.extensions.length === 0) {
      recipe.extensions = [
        { type: "streamable_http", name: "agentgateway", uri: "http://gateway:3000/mcp", timeout: 60 },
      ];
    }
    recipe.extensions[0].available_tools = [...new Set(input.tools)].sort();
    recipe.instructions = input.instructions;
    writeRecipe(input.persona, recipe);

    const warm = await recyclePersonaMachines(userId, input.persona);
    return { ok: true, warm };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
