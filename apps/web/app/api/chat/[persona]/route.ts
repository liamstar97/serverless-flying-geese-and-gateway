// POST /api/chat/[persona]
// Body: { sessionId: string; message: string }
// Response: text/event-stream proxying the goose-runner's WS chat output.
//
// Each goose stream-json line (already valid JSON) becomes one SSE
// `data: <line>\n\n` frame. We close the SSE stream when goose emits
// its synthetic {event:"done"} frame.

import { NextRequest } from "next/server";
import { z } from "zod";
import WebSocket from "ws";

import { auth } from "@/auth";
import { personaExists } from "@/lib/persona-store";
import { getOrSpawnGoose } from "@/lib/orchestrator";
import { touchSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(8),
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }))
    .optional()
    .default([]),
});

/**
 * Goose runs with --no-session, so each invocation is a clean conversation.
 * To preserve continuity we splice the prior turns the browser kept in
 * localStorage into the prompt itself. The cost is tokens; the win is
 * "go back to a tab and the agent still knows what we were talking about".
 */
function withHistory(
  message: string,
  history: { role: "user" | "assistant"; text: string }[],
): string {
  if (history.length === 0) return message;
  const lines = history.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join("\n\n");
  return `Conversation so far:\n\n${lines}\n\n---\n\nUSER (now): ${message}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ persona: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("unauthorized", { status: 401 });
  }
  const userId = (session.user as { id?: string }).id ?? session.user.email ?? "anon";

  const { persona } = await params;
  if (!personaExists(persona)) {
    return new Response(`unknown persona: ${persona}`, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }
  const { sessionId, history } = parsed.data;
  // Cap how much history we splice in — at some point this is wasteful and
  // confuses the model more than it helps. Keep the most recent turns.
  const trimmed = history.slice(-12);
  const message = withHistory(parsed.data.message, trimmed);

  let wsUrl: string;
  try {
    wsUrl = await getOrSpawnGoose(userId, persona, sessionId);
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[chat] orchestrator failed:", msg);
    return new Response(`spawn failed: ${msg}`, { status: 500 });
  }
  touchSession(userId, persona, sessionId);

  console.log(`[chat] opening WS to ${wsUrl} for user=${userId} persona=${persona}`);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const sse = (line: string) => {
        try {
          controller.enqueue(enc.encode(`data: ${line}\n\n`));
        } catch (e) {
          console.error("[chat] enqueue failed:", (e as Error).message);
        }
      };

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        console.error("[chat] WS construct failed:", (e as Error).message);
        sse(JSON.stringify({ event: "error", error: (e as Error).message }));
        controller.close();
        return;
      }

      let closed = false;
      const close = (why: string) => {
        if (closed) return;
        closed = true;
        console.log(`[chat] closing (${why})`);
        try { ws.close(); } catch {}
        try { controller.close(); } catch {}
      };

      ws.on("open", () => {
        console.log("[chat] WS open, sending message");
        ws.send(JSON.stringify({ message }));
      });
      ws.on("message", (raw) => {
        const line = raw.toString();
        sse(line);
        try {
          const ev = JSON.parse(line);
          if (ev?.event === "done") close("done event");
        } catch { /* goose stream-json frame, not our wrapper sentinel */ }
      });
      ws.on("error", (err) => {
        console.error("[chat] WS error:", (err as NodeJS.ErrnoException).code ?? "", err.message);
        sse(JSON.stringify({ event: "error", error: err.message }));
        close("ws error");
      });
      ws.on("close", (code, reason) => {
        console.log(`[chat] WS closed code=${code} reason=${reason?.toString() || ""}`);
        close("ws close");
      });

      req.signal.addEventListener("abort", () => {
        console.log("[chat] request aborted by client");
        close("client abort");
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
