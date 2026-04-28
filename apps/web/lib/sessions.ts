// Tiny session-mapping store: (userId, persona, sessionId) -> containerId + ws.
// SQLite via better-sqlite3 because we run with one Next.js process and a
// single writer; no need for Postgres yet.

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

import type { Persona } from "./personas";

const DB_PATH = process.env.SESSIONS_DB_PATH ?? "./data/sessions.db";

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      user_id      TEXT NOT NULL,
      persona      TEXT NOT NULL,
      session_id   TEXT NOT NULL,
      container_id TEXT NOT NULL,
      ws_url       TEXT NOT NULL,
      last_used_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, persona, session_id)
    );
  `);
  _db = d;
  return d;
}

export interface SessionRow {
  user_id: string;
  persona: Persona;
  session_id: string;
  container_id: string;
  ws_url: string;
  last_used_at: number;
}

export function findSession(userId: string, persona: Persona, sessionId: string): SessionRow | null {
  const row = db()
    .prepare(
      "SELECT * FROM sessions WHERE user_id = ? AND persona = ? AND session_id = ?",
    )
    .get(userId, persona, sessionId) as SessionRow | undefined;
  return row ?? null;
}

export function upsertSession(row: SessionRow): void {
  db()
    .prepare(
      `INSERT INTO sessions (user_id, persona, session_id, container_id, ws_url, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, persona, session_id) DO UPDATE SET
         container_id = excluded.container_id,
         ws_url       = excluded.ws_url,
         last_used_at = excluded.last_used_at`,
    )
    .run(
      row.user_id,
      row.persona,
      row.session_id,
      row.container_id,
      row.ws_url,
      row.last_used_at,
    );
}

export function touchSession(userId: string, persona: Persona, sessionId: string): void {
  db()
    .prepare(
      "UPDATE sessions SET last_used_at = ? WHERE user_id = ? AND persona = ? AND session_id = ?",
    )
    .run(Date.now(), userId, persona, sessionId);
}

export function deleteSession(userId: string, persona: Persona, sessionId: string): void {
  db()
    .prepare(
      "DELETE FROM sessions WHERE user_id = ? AND persona = ? AND session_id = ?",
    )
    .run(userId, persona, sessionId);
}

export function listIdleSessions(maxAgeMs: number): SessionRow[] {
  const cutoff = Date.now() - maxAgeMs;
  return db()
    .prepare("SELECT * FROM sessions WHERE last_used_at < ?")
    .all(cutoff) as SessionRow[];
}
