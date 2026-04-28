#!/usr/bin/env node
// Tiny CLI to seed/manage the users table without touching the running app.
// Useful for local dev (the env-var seed only kicks in when the table is
// empty and the user is signing in for the first time).
//
// Usage:
//   node scripts/admin.mjs add <login> [role]
//   node scripts/admin.mjs remove <login>
//   node scripts/admin.mjs list

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.SESSIONS_DB_PATH ?? "./data/sessions.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    login    TEXT PRIMARY KEY,
    role     TEXT NOT NULL CHECK (role IN ('admin','user')),
    added_at INTEGER NOT NULL,
    added_by TEXT
  );
`);

const [, , cmd, ...args] = process.argv;

function usage(code = 0) {
  console.log("usage:");
  console.log("  admin add <login> [admin|user]   default role=admin");
  console.log("  admin remove <login>");
  console.log("  admin list");
  process.exit(code);
}

if (cmd === "list") {
  const rows = db.prepare("SELECT * FROM users ORDER BY added_at ASC").all();
  if (rows.length === 0) console.log("(no users)");
  for (const r of rows) {
    const when = new Date(r.added_at).toISOString().slice(0, 10);
    console.log(`  ${r.login.padEnd(20)} ${r.role.padEnd(6)} ${when}`);
  }
} else if (cmd === "add") {
  const [login, role = "admin"] = args;
  if (!login) usage(2);
  const l = login.toLowerCase();
  const existing = db.prepare("SELECT * FROM users WHERE login = ?").get(l);
  if (existing) {
    db.prepare("UPDATE users SET role = ? WHERE login = ?").run(role, l);
    console.log(`updated ${l} -> ${role}`);
  } else {
    db.prepare(
      "INSERT INTO users (login, role, added_at, added_by) VALUES (?, ?, ?, ?)",
    ).run(l, role, Date.now(), "cli");
    console.log(`added ${l} as ${role}`);
  }
} else if (cmd === "remove") {
  const [login] = args;
  if (!login) usage(2);
  const r = db.prepare("DELETE FROM users WHERE login = ?").run(login.toLowerCase());
  console.log(`removed ${r.changes} row(s)`);
} else {
  usage(cmd ? 2 : 0);
}
