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
import { isPersona } from "@/lib/personas";
import { getOrSpawnGoose } from "@/lib/orchestrator";
import { touchSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(8),
  message: z.string().min(1),
});

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
  if (!isPersona(persona)) {
    return new Response(`unknown persona: ${persona}`, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }
  const { sessionId, message } = parsed.data;

  let wsUrl: string;
  try {
    wsUrl = await getOrSpawnGoose(userId, persona, sessionId);
  } catch (e) {
    return new Response(`spawn failed: ${(e as Error).message}`, { status: 500 });
  }
  touchSession(userId, persona, sessionId);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const sse = (line: string) => controller.enqueue(enc.encode(`data: ${line}\n\n`));

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        sse(JSON.stringify({ event: "error", error: (e as Error).message }));
        controller.close();
        return;
      }

      const close = () => {
        try { ws.close(); } catch {}
        try { controller.close(); } catch {}
      };

      ws.on("open", () => {
        ws.send(JSON.stringify({ message }));
      });
      ws.on("message", (raw) => {
        const line = raw.toString();
        sse(line);
        // goose-runner sends a synthetic done event when goose exits.
        try {
          const ev = JSON.parse(line);
          if (ev?.event === "done") close();
        } catch { /* line is goose stream-json, not our wrapper event */ }
      });
      ws.on("error", (err) => {
        sse(JSON.stringify({ event: "error", error: err.message }));
        close();
      });
      ws.on("close", close);

      // Best-effort: drop the WS if the client disconnects.
      req.signal.addEventListener("abort", close);
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
