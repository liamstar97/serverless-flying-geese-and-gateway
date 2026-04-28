"use client";

import { useMemo, useState, useTransition } from "react";
import { Save, Search, Plus, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { JsonEditor } from "@/components/JsonEditor";
import { cn } from "@/lib/utils";

import { saveToolAction, deleteToolAction } from "./actions";

interface ToolDef {
  name: string;
  description?: string;
  source?: unknown;
  spec?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
  outputTransform?: unknown;
  [k: string]: unknown;
}

function compositionKind(t: ToolDef): string {
  const spec = t.spec as { kind?: string } | undefined;
  if (spec?.kind) return spec.kind;
  if (t.outputTransform) return "transform";
  return "alias";
}

const NEW_TOOL_TEMPLATE: ToolDef = {
  name: "my_new_tool",
  description: "What this composed tool does",
  source: { target: "search-service", tool: "exa_search" },
};

export function RegistryEditor({
  initialTools,
  schemaVersion,
}: {
  initialTools: ToolDef[];
  schemaVersion: string;
}) {
  const [tools, setTools] = useState<ToolDef[]>(initialTools);
  const [selectedName, setSelectedName] = useState<string | null>(initialTools[0]?.name ?? null);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<string>(
    initialTools[0] ? JSON.stringify(initialTools[0], null, 2) : "",
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return tools;
    return tools.filter(
      (t) => t.name.toLowerCase().includes(f) || (t.description ?? "").toLowerCase().includes(f),
    );
  }, [filter, tools]);

  const select = (t: ToolDef) => {
    setSelectedName(t.name);
    setDraft(JSON.stringify(t, null, 2));
    setParseError(null);
  };

  const newTool = () => {
    setSelectedName(null);
    setDraft(JSON.stringify(NEW_TOOL_TEMPLATE, null, 2));
    setParseError(null);
  };

  const save = () => {
    let parsed: ToolDef;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setParseError((e as Error).message);
      return;
    }
    if (!parsed.name || typeof parsed.name !== "string") {
      setParseError("tool needs a string `name`");
      return;
    }
    setParseError(null);
    startTransition(async () => {
      const res = await saveToolAction({ tool: parsed, replacing: selectedName ?? undefined });
      if (res?.error) toast.error(res.error);
      else {
        toast.success(selectedName ? `${parsed.name} saved` : `${parsed.name} added`);
        // Reflect locally without round-tripping the page.
        setTools((prev) => {
          const without = prev.filter((t) => t.name !== (selectedName ?? "") && t.name !== parsed.name);
          return [...without, parsed].sort((a, b) => a.name.localeCompare(b.name));
        });
        setSelectedName(parsed.name);
      }
    });
  };

  const reset = () => {
    if (!selectedName) return;
    const t = tools.find((x) => x.name === selectedName);
    if (t) setDraft(JSON.stringify(t, null, 2));
    setParseError(null);
  };

  const remove = () => {
    if (!selectedName) return;
    if (!confirm(`Delete tool "${selectedName}"? This is written immediately.`)) return;
    startTransition(async () => {
      const res = await deleteToolAction({ name: selectedName });
      if (res?.error) toast.error(res.error);
      else {
        toast.success(`${selectedName} removed`);
        setTools((prev) => prev.filter((t) => t.name !== selectedName));
        const next = tools.find((t) => t.name !== selectedName);
        if (next) select(next); else { setSelectedName(null); setDraft(""); }
      }
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-[320px,1fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter tools…"
            className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
          <span>schemaVersion <code className="rounded bg-secondary px-1 py-0.5">{schemaVersion}</code></span>
          <Button variant="ghost" size="sm" onClick={newTool} className="h-7 px-2 text-xs">
            <Plus className="size-3.5" /> new
          </Button>
        </div>
        <ScrollArea className="h-[64vh]">
          <ul className="px-2 pb-2">
            {filtered.map((t) => {
              const sel = t.name === selectedName;
              const kind = compositionKind(t);
              return (
                <li key={t.name}>
                  <button
                    onClick={() => select(t)}
                    className={cn(
                      "w-full rounded-md px-2 py-2 text-left transition-colors",
                      sel ? "bg-primary/10" : "hover:bg-accent/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className={cn("truncate font-mono text-xs", sel ? "text-primary" : "text-foreground/90")}>
                        {t.name}
                      </code>
                      <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                        {kind}
                      </Badge>
                    </div>
                    {t.description && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{t.description}</p>
                    )}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="py-12 text-center text-sm text-muted-foreground">no tools match.</li>
            )}
          </ul>
        </ScrollArea>
      </Card>

      <Card className="flex h-[72vh] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b bg-card px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <code className="font-mono text-xs text-muted-foreground">tool</code>
            <code className="font-mono text-sm">{selectedName ?? <span className="text-muted-foreground">new</span>}</code>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={!selectedName || pending}>
              <RotateCcw className="size-3.5" /> reset
            </Button>
            <Button variant="ghost" size="sm" onClick={remove} disabled={!selectedName || pending} className="text-destructive">
              <Trash2 className="size-3.5" /> delete
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              <Save className="size-4" /> {pending ? "saving…" : "save"}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-background/40">
          <JsonEditor
            value={draft}
            onChange={(v) => { setDraft(v); setParseError(null); }}
          />
        </div>

        <div className="flex items-center justify-between border-t bg-card px-4 py-2 text-xs">
          {parseError ? (
            <span className="text-destructive">{parseError}</span>
          ) : (
            <span className="text-muted-foreground">JSON · gateway hot-reloads on a 10s interval</span>
          )}
          <span className="text-muted-foreground">{draft.length.toLocaleString()} chars</span>
        </div>
      </Card>
    </div>
  );
}
