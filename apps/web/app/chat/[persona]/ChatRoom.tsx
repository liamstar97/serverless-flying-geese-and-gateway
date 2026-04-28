"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Persona } from "@/lib/personas";

// One bubble in the chat. Goose's stream-json speaks four event shapes we
// care about; each becomes its own bubble:
//   * user message (we render it locally on send)
//   * assistant text (text chunks accumulate into one bubble per turn)
//   * tool request (collapsible, shows tool name + arguments)
//   * tool response (collapsible, shows tool result)
type Bubble =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool_request"; id: string; name: string; args: unknown }
  | { kind: "tool_response"; id: string; result: unknown }
  | { kind: "error"; text: string };

function sessionIdFor(persona: Persona): string {
  const key = `gloop:sessionId:${persona}`;
  if (typeof window === "undefined") return "ssr";
  let v = window.localStorage.getItem(key);
  if (!v) {
    v = crypto.randomUUID();
    window.localStorage.setItem(key, v);
  }
  return v;
}

export function ChatRoom({ persona }: { persona: Persona }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const sidRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sidRef.current = sessionIdFor(persona);
  }, [persona]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [bubbles]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || busy) return;
    setBubbles((b) => [...b, { kind: "user", text: message }]);
    setDraft("");
    setBusy(true);

    try {
      const res = await fetch(`/api/chat/${persona}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sidRef.current, message }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => res.statusText);
        setBubbles((b) => [...b, { kind: "error", text: `${res.status}: ${text}` }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantOpen = false;

      const appendAssistant = (chunk: string) =>
        setBubbles((b) => {
          if (assistantOpen && b.length && b[b.length - 1].kind === "assistant") {
            const last = b[b.length - 1] as Bubble & { kind: "assistant" };
            return [...b.slice(0, -1), { ...last, text: last.text + chunk }];
          }
          assistantOpen = true;
          return [...b, { kind: "assistant", text: chunk }];
        });

      // SSE framing: lines beginning with `data: `, separated by blank lines.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          if (!frame.startsWith("data: ")) continue;
          const data = frame.slice(6);
          let ev: any;
          try { ev = JSON.parse(data); } catch { continue; }

          // wrapper-synthesized events
          if (ev.event === "done") return;
          if (ev.event === "error") {
            setBubbles((b) => [...b, { kind: "error", text: String(ev.error) }]);
            assistantOpen = false;
            continue;
          }
          if (ev.event === "stderr") continue; // ignore for chat UI

          // goose stream-json events
          if (ev.type === "complete") { assistantOpen = false; continue; }
          if (ev.type !== "message" || !ev.message?.content) continue;

          for (const part of ev.message.content) {
            if (part.type === "text" && ev.message.role === "assistant") {
              appendAssistant(part.text);
            } else if (part.type === "toolRequest") {
              const v = part.toolCall?.value ?? {};
              setBubbles((b) => [...b, { kind: "tool_request", id: part.id, name: v.name, args: v.arguments }]);
              assistantOpen = false;
            } else if (part.type === "toolResponse") {
              setBubbles((b) => [...b, { kind: "tool_response", id: part.id, result: part.toolResult?.value }]);
              assistantOpen = false;
            }
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }, [busy, draft, persona]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", minHeight: 0 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.6rem", paddingRight: "0.25rem" }}>
        {bubbles.map((b, i) => (
          <BubbleView key={i} b={b} />
        ))}
        {busy && <div style={{ color: "var(--muted)", fontStyle: "italic" }}>thinking…</div>}
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <textarea
          rows={2}
          style={{ flex: 1 }}
          placeholder="Ask the agent something…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !draft.trim()}>Send</button>
      </div>
    </div>
  );
}

function BubbleView({ b }: { b: Bubble }) {
  const base = { padding: "0.7rem 0.9rem", borderRadius: 12, maxWidth: "100%", whiteSpace: "pre-wrap" as const };
  if (b.kind === "user") {
    return <div style={{ ...base, background: "color-mix(in srgb, var(--user) 25%, transparent)", alignSelf: "flex-end" }}>{b.text}</div>;
  }
  if (b.kind === "assistant") {
    return <div style={{ ...base, background: "var(--panel)", border: "1px solid var(--panel-2)" }}>{b.text || "…"}</div>;
  }
  if (b.kind === "error") {
    return <div style={{ ...base, background: "#7f1d1d", color: "#fecaca" }}>{b.text}</div>;
  }
  if (b.kind === "tool_request") {
    return (
      <details style={{ background: "color-mix(in srgb, var(--tool) 18%, transparent)", border: "1px solid color-mix(in srgb, var(--tool) 50%, transparent)", borderRadius: 12, padding: "0.5rem 0.75rem" }}>
        <summary style={{ cursor: "pointer" }}>🔧 <code>{b.name}</code></summary>
        <pre style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>{JSON.stringify(b.args, null, 2)}</pre>
      </details>
    );
  }
  // tool_response
  return (
    <details style={{ background: "var(--panel)", border: "1px dashed var(--panel-2)", borderRadius: 12, padding: "0.5rem 0.75rem", color: "var(--muted)" }}>
      <summary style={{ cursor: "pointer" }}>↩ tool result</summary>
      <pre style={{ margin: "0.5rem 0 0", fontSize: "0.8rem" }}>{JSON.stringify(b.result, null, 2)}</pre>
    </details>
  );
}
