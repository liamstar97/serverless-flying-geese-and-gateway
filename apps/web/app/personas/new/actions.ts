"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { createPersona, type SavePersonaInput } from "@/lib/persona-store";

export async function createPersonaAction(
  input: SavePersonaInput,
): Promise<{ id: string; error?: undefined } | { error: string; id?: undefined }> {
  const session = await auth();
  if (!session?.user) return { error: "not signed in" };

  try {
    const cfg = createPersona(input);
    revalidatePath("/");
    return { id: cfg.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
