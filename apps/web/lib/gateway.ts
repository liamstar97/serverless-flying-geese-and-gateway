// Tiny MCP client used server-side to list tools available on the gateway.
// Skips the JSON-RPC niceties — just the bare initialize → list flow.
//
// Env GATEWAY_INTERNAL_URL points at the gateway from this process. Locally
// the dev server runs on the host while the gateway is in a container, so
// `http://localhost:3000` is correct. On Fly we'll use `*.internal:3000`.

const GATEWAY = process.env.GATEWAY_INTERNAL_URL ?? "http://localhost:3000";

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
  const res = await fetch(`${GATEWAY}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", ...(id ? { id } : {}), method, params }),
    cache: "no-store",
  });

  const sid = res.headers.get("mcp-session-id") ?? undefined;
  const body = await res.text();
  return { body, sessionId: sid };
}

export async function listGatewayTools(): Promise<ToolEntry[]> {
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
