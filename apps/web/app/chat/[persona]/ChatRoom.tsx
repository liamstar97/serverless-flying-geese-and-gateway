"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw, Send, Wrench } from "lucide-react";

import type { Persona } from "@/lib/personas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Bubble =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool_request"; id: string; name: string; args: unknown }
  | { kind: "tool_response"; id: string; result: unknown }
  | { kind: "error"; text: string };

function sessionKey(persona: Persona): string {
  return `gloop:sessionId:${persona}`;
}

function sessionIdFor(persona: Persona): string {
  if (typeof window === "undefined") return "ssr";
  const key = sessionKey(persona);
  let v = window.localStorage.getItem(key);
  if (!v) {
    v = crypto.randomUUID();
    window.localStorage.setItem(key, v);
  }
  return v;
}

function newSessionFor(persona: Persona): string {
  const v = crypto.randomUUID();
  window.localStorage.setItem(sessionKey(persona), v);
  return v;
}

export function ChatRoom({ persona, accentColor }: { persona: Persona; accentColor: string }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "spawning" | "streaming">("idle");
  const sidRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { sidRef.current = sessionIdFor(persona); }, [persona]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, phase]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || busy) return;
    setBubbles((b) => [...b, { kind: "user", text: message }]);
    setDraft("");
    setBusy(true);
    setPhase("spawning");

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

      let firstFrame = true;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (firstFrame) { setPhase("streaming"); firstFrame = false; }
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          if (!frame.startsWith("data: ")) continue;
          const data = frame.slice(6);
          let ev: any;
          try { ev = JSON.parse(data); } catch { continue; }

          if (ev.event === "done") return;
          if (ev.event === "error") {
            setBubbles((b) => [...b, { kind: "error", text: String(ev.error) }]);
            assistantOpen = false; continue;
          }
          if (ev.event === "stderr") continue;
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
      setPhase("idle");
    }
  }, [busy, draft, persona]);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden" style={{ ["--accent" as string]: accentColor }}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-2xl border bg-card/40"
      >
        <div className="flex flex-col gap-3 p-4">
          {bubbles.length === 0 && phase === "idle" && (
            <EmptyState />
          )}
          {bubbles.map((b, i) => <BubbleView key={i} b={b} />)}
          {phase !== "idle" && <TypingIndicator phase={phase} />}
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex gap-2 rounded-2xl border bg-card p-2"
      >
        <Textarea
          rows={2}
          placeholder="Ask the agent something — or just say hi…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
          className="min-h-[44px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex flex-col items-end gap-1">
          <Button
            type="submit"
            size="sm"
            disabled={busy || !draft.trim()}
            className="text-background"
            style={{ background: "var(--accent)" }}
          >
            <Send className="size-3.5" /> Send
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              sidRef.current = newSessionFor(persona);
              setBubbles([]);
            }}
          >
            <RotateCcw className="size-3.5" /> New chat
          </Button>
        </div>
      </form>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <div className="text-3xl text-muted-foreground/40">···</div>
      <div className="text-sm text-muted-foreground">
        First message spawns a fresh goose machine. Cold-start is ~2-3s here, ~300ms on Fly.
      </div>
    </div>
  );
}

function TypingIndicator({ phase }: { phase: "spawning" | "streaming" }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--accent)" }} />
        <span className="relative inline-flex size-2 rounded-full" style={{ background: "var(--accent)" }} />
      </span>
      {phase === "spawning" ? "spawning machine…" : "goose is thinking…"}
    </div>
  );
}

function BubbleView({ b }: { b: Bubble }) {
  if (b.kind === "user") {
    return (
      <div className="ml-12 self-end rounded-2xl rounded-br-md border bg-(--accent) px-3.5 py-2 text-sm text-background shadow-sm">
        {b.text}
      </div>
    );
  }
  if (b.kind === "assistant") {
    return (
      <div className="mr-12 self-start whitespace-pre-wrap rounded-2xl rounded-bl-md border bg-card px-3.5 py-2 text-sm leading-relaxed">
        {b.text || <span className="text-muted-foreground">…</span>}
      </div>
    );
  }
  if (b.kind === "error") {
    return (
      <div className="self-stretch rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-sm text-destructive-foreground">
        ⚠ {b.text}
      </div>
    );
  }
  if (b.kind === "tool_request") return <ToolCard kind="request" name={b.name} payload={b.args} />;
  return <ToolCard kind="response" payload={b.result} />;
}

function ToolCard({
  kind,
  name,
  payload,
}: {
  kind: "request" | "response";
  name?: string;
  payload: unknown;
}) {
  const json = JSON.stringify(payload, null, 2);
  return (
    <Collapsible defaultOpen={kind === "request"} className="self-stretch">
      <div className="overflow-hidden rounded-xl border bg-card/50">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wrench className="size-3.5" style={kind === "request" ? { color: "var(--accent)" } : undefined} />
            <span className="font-mono text-foreground/80">{kind === "request" ? name ?? "tool" : "↩ result"}</span>
            <span className="text-muted-foreground/60">{kind === "request" ? "request" : "response"}</span>
          </div>
          <ChevronDown className="size-3.5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="m-0 max-h-72 overflow-auto bg-background/60 px-3 py-2 font-mono text-[11px] leading-snug">
            {json
              .split("\n")
              .map((line, i) => (
                <div key={i} className="flex gap-3">
                  <span className="select-none text-muted-foreground/40">{String(i + 1).padStart(3, " ")}</span>
                  <span className="whitespace-pre">{line}</span>
                </div>
              ))}
          </pre>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
