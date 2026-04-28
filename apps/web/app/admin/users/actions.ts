"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  addUser,
  countAdmins,
  getUser,
  isAdmin,
  removeUser,
  setRole,
  type UserRow,
  type Role,
} from "@/lib/users-store";

async function requireAdmin(): Promise<{ login: string } | { error: string }> {
  const session = await auth();
  const login = (session?.user as { login?: string } | undefined)?.login;
  if (!login || !isAdmin(login)) return { error: "admin only" };
  return { login };
}

export async function addUserAction(input: { login: string; role: Role }):
  Promise<{ user?: UserRow; error?: string }> {
  const me = await requireAdmin();
  if ("error" in me) return { error: me.error };
  try {
    const u = addUser(input.login, input.role, me.login);
    revalidatePath("/admin/users");
    return { user: u };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function removeUserAction(input: { login: string }):
  Promise<{ ok?: true; error?: string }> {
  const me = await requireAdmin();
  if ("error" in me) return { error: me.error };
  if (input.login.toLowerCase() === me.login.toLowerCase()) return { error: "can't remove yourself" };
  const target = getUser(input.login);
  if (!target) return { error: "no such user" };
  if (target.role === "admin" && countAdmins() === 1) return { error: "can't remove the last admin" };
  try {
    removeUser(input.login);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setRoleAction(input: { login: string; role: Role }):
  Promise<{ ok?: true; error?: string }> {
  const me = await requireAdmin();
  if ("error" in me) return { error: me.error };
  const target = getUser(input.login);
  if (!target) return { error: "no such user" };
  if (
    input.login.toLowerCase() === me.login.toLowerCase() &&
    input.role === "user" &&
    countAdmins() === 1
  ) {
    return { error: "can't demote the last admin" };
  }
  try {
    setRole(input.login, input.role);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
