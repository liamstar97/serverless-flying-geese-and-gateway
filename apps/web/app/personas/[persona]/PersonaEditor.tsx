"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";

import type { Persona } from "@/lib/personas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { savePersonaAction } from "./actions";

interface Tool { name: string; description?: string }

function bucket(name: string): string {
  if (name.startsWith("virtual_")) return "virtual";
  const u = name.indexOf("_");
  return u > 0 ? name.slice(0, u) : "other";
}

export function PersonaEditor({
  persona,
  accentVar,
  allTools,
  initialEnabled,
  initialInstructions,
}: {
  persona: Persona;
  accentVar: string;
  allTools: Tool[];
  initialEnabled: string[];
  initialInstructions: string;
}) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(initialEnabled));
  const [instructions, setInstructions] = useState(initialInstructions);
  const [filter, setFilter] = useState("");
  const [bucketFilter, setBucketFilter] = useState<"all" | "virtual" | "backend">("all");
  const [pending, startTransition] = useTransition();

  const buckets = useMemo(() => {
    const map = new Map<string, Tool[]>();
    for (const t of allTools) {
      const k = bucket(t.name);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return [...map.entries()].sort(([a], [b]) =>
      a === "virtual" ? -1 : b === "virtual" ? 1 : a.localeCompare(b),
    );
  }, [allTools]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return buckets.flatMap(([key, tools]) => {
      if (bucketFilter === "virtual" && key !== "virtual") return [];
      if (bucketFilter === "backend" && key === "virtual") return [];
      const inBucket = f
        ? tools.filter((t) => t.name.toLowerCase().includes(f) || (t.description ?? "").toLowerCase().includes(f))
        : tools;
      if (inBucket.length === 0) return [];
      return [{ key, tools: inBucket }];
    });
  }, [buckets, filter, bucketFilter]);

  const toggle = (name: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const setBucketSelection = (key: string, on: boolean) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      const tools = buckets.find(([k]) => k === key)?.[1] ?? [];
      for (const t of tools) {
        if (on) next.add(t.name); else next.delete(t.name);
      }
      return next;
    });
  };

  const save = () => {
    startTransition(async () => {
      const res = await savePersonaAction({
        persona,
        tools: [...enabled],
        instructions,
      });
      if (res?.error) toast.error(res.error);
      else toast.success(res?.warm ? `saved — recycled ${res.warm} live machine(s)` : "saved");
    });
  };

  const accent = `var(${accentVar})`;

  return (
    <div className="grid gap-5 md:grid-cols-[1fr,360px]">
      <div className="flex flex-col gap-4">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter tools…"
              className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <div className="flex gap-1 text-xs">
              {(["all", "virtual", "backend"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setBucketFilter(k)}
                  className={cn(
                    "rounded-md border px-2 py-1 transition-colors",
                    bucketFilter === k ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="h-[60vh]">
            <div className="space-y-5 px-3 py-3">
              {filtered.map(({ key, tools }) => {
                const allEnabled = tools.every((t) => enabled.has(t.name));
                const anyEnabled = tools.some((t) => enabled.has(t.name));
                return (
                  <section key={key}>
                    <header className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{key}</h3>
                        <Badge variant="outline" className="text-[10px] tabular-nums">
                          {tools.filter((t) => enabled.has(t.name)).length}/{tools.length}
                        </Badge>
                      </div>
                      <button
                        onClick={() => setBucketSelection(key, !allEnabled)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {allEnabled ? "clear all" : anyEnabled ? "select all" : "select all"}
                      </button>
                    </header>
                    <ul className="grid gap-1.5">
                      {tools.map((t) => {
                        const on = enabled.has(t.name);
                        return (
                          <li key={t.name}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-lg border bg-card/40 p-2.5 transition-colors hover:bg-accent/40",
                                on && "border-(--accent) bg-(--accent-bg)",
                              )}
                              style={
                                on
                                  ? ({ ["--accent" as string]: accent, ["--accent-bg" as string]: `color-mix(in oklab, ${accent} 8%, transparent)` } as React.CSSProperties)
                                  : undefined
                              }
                            >
                              <Checkbox
                                checked={on}
                                onCheckedChange={() => toggle(t.name)}
                                className="mt-0.5"
                              />
                              <div className="min-w-0 flex-1">
                                <code className="block truncate font-mono text-xs text-foreground/90">{t.name}</code>
                                {t.description && (
                                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t.description}</p>
                                )}
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">no tools match.</div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Selection</h3>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums" style={{ color: accent }}>{enabled.size}</span>
            <span className="text-sm text-muted-foreground">tools enabled</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Goose's recipe scopes which tools the LLM can see in its context.
            Smaller surface = better tool selection, fewer tokens, faster turns.
          </p>
        </Card>

        <Card className="p-4">
          <Label htmlFor="instructions" className="text-sm">System instructions</Label>
          <Textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={10}
            className="mt-2 font-mono text-xs"
            placeholder="You are a research assistant…"
          />
        </Card>

        <Separator />

        <Button
          onClick={save}
          disabled={pending}
          className="text-background"
          style={{ background: accent }}
        >
          <Save className="size-4" /> {pending ? "saving…" : "save recipe"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Saves <code className="font-mono">{persona}.yaml</code> on the host volume.
          Any in-flight goose machine for this persona is stopped — the next message respawns
          with the new recipe.
        </p>
      </aside>
    </div>
  );
}
