// Tiny MCP client used server-side to list tools available on the gateway.
// Skips the JSON-RPC niceties — just the bare initialize → list flow.
//
// On Fly the gateway app may be scaled to zero. Calling fetch before any
// machine is started fails at DNS (`<app>.internal` resolves to nothing
// while zero machines are up). We use the Machines API to wake the app
// before each call. This is a no-op when something is already running.

import { wakeApp } from "./fly";

const GATEWAY = process.env.GATEWAY_INTERNAL_URL ?? "http://localhost:3000";
const GATEWAY_APP = process.env.FLY_GATEWAY_APP ?? "";

async function ensureGatewayWarm(): Promise<void> {
  if (!GATEWAY_APP) return; // local dev — docker compose handles uptime
  try {
    await wakeApp(GATEWAY_APP);
  } catch (e) {
    console.warn(`[gateway] wakeApp failed: ${(e as Error).message}`);
  }
}

export interface ToolEntry {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

async function rpc(method: string, params: unknown, sessionId?: string): Promise<{ body: string; sessionId?: string }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const id = method === "notifications/initialized" ? undefined : 1;
  // Retry once: first attempt may race the post-wake DNS propagation.
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${GATEWAY}/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", ...(id ? { id } : {}), method, params }),
        cache: "no-store",
      });
      const sid = res.headers.get("mcp-session-id") ?? undefined;
      const body = await res.text();
      return { body, sessionId: sid };
    } catch (e) {
      lastErr = e as Error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr ?? new Error("rpc failed");
}

export async function listGatewayTools(): Promise<ToolEntry[]> {
  await ensureGatewayWarm();
  const init = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "gloop-web", version: "0.1.0" },
  });
  const sid = init.sessionId;
  if (!sid) throw new Error("gateway did not return mcp-session-id");

  await rpc("notifications/initialized", undefined, sid);

  const list = await rpc("tools/list", undefined, sid);
  // SSE response — strip `data: ` prefix if present.
  const dataLine = list.body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("data: "));
  const json = dataLine ? dataLine.slice(6) : list.body;
  const parsed = JSON.parse(json) as { result?: { tools?: ToolEntry[] } };
  return parsed.result?.tools ?? [];
}
