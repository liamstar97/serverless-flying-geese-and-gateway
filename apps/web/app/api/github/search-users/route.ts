// GET /api/github/search-users?q=<query>
//
// Thin proxy + cache over GitHub's Search Users API. Used by the admin
// /users page to autocomplete logins. Auth.js session-protected so we
// don't expose a free GitHub-search proxy to the world.
//
// Rate limits:
//   - unauthenticated: 10 reqs/min/IP
//   - authenticated (token in Authorization): 30/min
// We add a tiny in-memory cache (60s) keyed on the query so repeat
// keystrokes don't burn quota.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/users-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GhUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  type: string;
}

interface Suggestion {
  login: string;
  avatar_url: string;
  html_url: string;
}

const cache = new Map<string, { at: number; payload: Suggestion[] }>();
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const session = await auth();
  const me = session?.user as { login?: string } | undefined;
  if (!me?.login || !isAdmin(me.login)) {
    return new Response("admin only", { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ results: [] });

  const cached = cache.get(q);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return Response.json({ results: cached.payload });
  }

  const url = new URL("https://api.github.com/search/users");
  url.searchParams.set("q", `${q} in:login type:user`);
  url.searchParams.set("per_page", "8");

  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "gloop-admin-autocomplete",
  };
  // Use a token if one is available so we get the higher rate limit.
  // GH_TOKEN, GITHUB_TOKEN, or AUTH_GITHUB_SECRET (which is an OAuth client
  // secret, not a token — only useful with a paired client id, so try last).
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return new Response(`github: ${res.status} ${text}`, { status: 502 });
  }

  const body = (await res.json()) as { items?: GhUser[] };
  const items = (body.items ?? []).filter((u) => u.type === "User");
  // Bias the closest match: exact login first, then logins that start with q.
  items.sort((a, b) => {
    const ql = q.toLowerCase();
    const aExact = a.login.toLowerCase() === ql ? 0 : 1;
    const bExact = b.login.toLowerCase() === ql ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aStarts = a.login.toLowerCase().startsWith(ql) ? 0 : 1;
    const bStarts = b.login.toLowerCase().startsWith(ql) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a.login.length - b.login.length;
  });
  const trimmed = items.slice(0, 8).map((u) => ({
    login: u.login,
    avatar_url: u.avatar_url,
    html_url: u.html_url,
  }));

  cache.set(q, { at: Date.now(), payload: trimmed });
  return Response.json({ results: trimmed });
}
