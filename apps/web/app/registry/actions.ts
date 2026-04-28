"use server";

import { auth } from "@/auth";
import { readRegistry, writeRegistry, type ToolDef } from "@/lib/registry";

export async function saveToolAction(input: {
  tool: ToolDef;
  replacing?: string;
}): Promise<{ ok?: true; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "not signed in" };

  try {
    const reg = readRegistry();
    const tools = reg.tools ?? [];

    const targetName = input.replacing ?? input.tool.name;
    const idx = tools.findIndex((t) => t.name === targetName);

    // Reject same-name collisions when not replacing.
    if (!input.replacing && idx >= 0) {
      return { error: `tool "${input.tool.name}" already exists` };
    }
    if (input.replacing && input.replacing !== input.tool.name) {
      // Renaming — make sure target name isn't taken
      if (tools.some((t) => t.name === input.tool.name)) {
        return { error: `tool "${input.tool.name}" already exists` };
      }
    }

    if (idx >= 0) tools[idx] = input.tool; else tools.push(input.tool);
    tools.sort((a, b) => a.name.localeCompare(b.name));

    reg.tools = tools;
    writeRegistry(reg);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteToolAction(input: {
  name: string;
}): Promise<{ ok?: true; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "not signed in" };

  try {
    const reg = readRegistry();
    reg.tools = (reg.tools ?? []).filter((t) => t.name !== input.name);
    writeRegistry(reg);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
