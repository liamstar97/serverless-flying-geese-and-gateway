// Simple users store: GitHub login -> role mapping. Replaces the
// env-var allowlist as the runtime source of truth, but the env var
// (ALLOWED_GITHUB_LOGINS) still seeds the first admin so deploys
// bootstrap with zero clicks.
//
// Lives in the same SQLite file as sessions so backups / volumes cover
// both. Single writer in this process — no concurrency concern.

import "server-only";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

import { DATA_PATHS } from "./data-paths";

export type Role = "admin" | "user";

export interface UserRow {
  login: string;
  role: Role;
  added_at: number;
  added_by: string | null;
}

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DATA_PATHS.sessions), { recursive: true });
  const d = new Database(DATA_PATHS.sessions);
  d.pragma("journal_mode = WAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      login    TEXT PRIMARY KEY,
      role     TEXT NOT NULL CHECK (role IN ('admin','user')),
      added_at INTEGER NOT NULL,
      added_by TEXT
    );
  `);
  _db = d;
  return d;
}

const SEED = (process.env.ALLOWED_GITHUB_LOGINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

export function getUser(login: string): UserRow | null {
  const row = db().prepare("SELECT * FROM users WHERE login = ?").get(normalizeLogin(login)) as
    | UserRow
    | undefined;
  return row ?? null;
}

export function listUsers(): UserRow[] {
  return db().prepare("SELECT * FROM users ORDER BY added_at ASC").all() as UserRow[];
}

export function countAdmins(): number {
  const r = db().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number };
  return r.n;
}

export function addUser(login: string, role: Role, addedBy: string | null): UserRow {
  const l = normalizeLogin(login);
  if (!l) throw new Error("login required");
  const existing = getUser(l);
  if (existing) throw new Error(`${l} already exists`);
  db()
    .prepare("INSERT INTO users (login, role, added_at, added_by) VALUES (?, ?, ?, ?)")
    .run(l, role, Date.now(), addedBy);
  return getUser(l)!;
}

export function removeUser(login: string): void {
  db().prepare("DELETE FROM users WHERE login = ?").run(normalizeLogin(login));
}

export function setRole(login: string, role: Role): void {
  db().prepare("UPDATE users SET role = ? WHERE login = ?").run(role, normalizeLogin(login));
}

/**
 * Called from the signIn callback. Decides whether the login is allowed
 * and may admit them as the bootstrap admin if the table is still empty
 * and the env-var seed lists their login. Returns the user's role on
 * success, or null on denial.
 */
export function admitOnSignIn(login: string): Role | null {
  const l = normalizeLogin(login);
  if (!l) return null;

  const existing = getUser(l);
  if (existing) return existing.role;

  // Bootstrap: if no admins exist yet and the env var seeds this login,
  // grant them admin.
  if (countAdmins() === 0 && SEED.includes(l)) {
    addUser(l, "admin", null);
    return "admin";
  }

  return null;
}

/** True if the given login is an admin. */
export function isAdmin(login: string | null | undefined): boolean {
  if (!login) return false;
  const u = getUser(login);
  return !!u && u.role === "admin";
}
