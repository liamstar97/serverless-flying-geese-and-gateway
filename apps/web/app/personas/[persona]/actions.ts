"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { personaExists, readRecipe, writeRecipe, deletePersona } from "@/lib/persona-store";
import { recyclePersonaMachines } from "@/lib/orchestrator";

export async function savePersonaAction(input: {
  persona: string;
  tools: string[];
  instructions: string;
}): Promise<{ ok?: true; warm?: number; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "not signed in" };
  if (!personaExists(input.persona)) return { error: "unknown persona" };

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
    revalidatePath("/");
    revalidatePath(`/chat/${input.persona}`);
    return { ok: true, warm };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deletePersonaAction(input: {
  persona: string;
}): Promise<{ ok?: true; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "not signed in" };
  if (!personaExists(input.persona)) return { error: "unknown persona" };

  const userId = (session.user as { id?: string }).id ?? session.user.email ?? "anon";

  try {
    await recyclePersonaMachines(userId, input.persona);
    deletePersona(input.persona);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
