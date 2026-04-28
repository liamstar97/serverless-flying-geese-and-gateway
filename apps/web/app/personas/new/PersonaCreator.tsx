"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { COLOR_PALETTE, GLYPH_PALETTE, slugify } from "@/lib/persona-types";
import { cn } from "@/lib/utils";

import { createPersonaAction } from "./actions";

interface Tool { name: string; description?: string }

export function PersonaCreator({ allTools }: { allTools: Tool[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [tagline, setTagline] = useState("");
  const [glyph, setGlyph] = useState(GLYPH_PALETTE[0]);
  const [color, setColor] = useState(COLOR_PALETTE[0].value);
  const [instructions, setInstructions] = useState("");
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();

  // Auto-derive id from label until the user manually edits the id field.
  useEffect(() => {
    if (!idTouched) setId(slugify(label));
  }, [label, idTouched]);

  const filteredVirtuals = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return allTools
      .filter((t) => t.name.startsWith("virtual_"))
      .filter((t) => !f || t.name.toLowerCase().includes(f) || (t.description ?? "").toLowerCase().includes(f))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTools, filter]);

  const valid =
    label.trim().length > 0 &&
    id.trim().length > 0 &&
    tagline.trim().length > 0 &&
    glyph.length > 0 &&
    color.length > 0;

  const submit = () => {
    if (!valid) {
      toast.error("fill in label, id, and tagline first");
      return;
    }
    startTransition(async () => {
      const res = await createPersonaAction({
        id: id.trim(),
        label: label.trim(),
        tagline: tagline.trim(),
        glyph,
        color,
        instructions,
        availableTools: [...enabled],
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${label} created`);
      router.push(`/personas/${res!.id}`);
    });
  };

  return (
    <div className="grid gap-5 md:grid-cols-[1fr,320px]">
      <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="label">Display name</Label>
            <Input
              id="label"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Data Explorer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="id">URL id</Label>
            <Input
              id="id"
              value={id}
              onChange={(e) => { setId(e.target.value); setIdTouched(true); }}
              placeholder="data-explorer"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              lowercase letters, digits, and hyphens. Becomes
              <code className="ml-1 rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">/chat/{id || "your-id"}</code>.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="What this persona is good at, in one sentence."
            />
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Glyph</Label>
              <div className="grid grid-cols-8 gap-1">
                {GLYPH_PALETTE.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGlyph(g)}
                    className={cn(
                      "grid aspect-square place-items-center rounded-md border text-base transition-colors",
                      g === glyph ? "border-(--accent) text-(--accent)" : "text-foreground/70 hover:border-foreground/50",
                    )}
                    style={{ ["--accent" as string]: color }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Accent</Label>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setColor(c.value)}
                    title={c.name}
                    className={cn(
                      "grid aspect-square place-items-center rounded-md border text-[11px] uppercase transition-all",
                      c.value === color ? "scale-105 border-foreground/50" : "border-border hover:border-foreground/30",
                    )}
                    style={{ background: `color-mix(in oklab, ${c.value} 14%, transparent)` }}
                  >
                    <span style={{ color: c.value }}>{c.value === color ? "●" : "○"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">System instructions</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder="You are a data exploration assistant. When asked about a topic, …"
            />
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              <Wand2 className="size-4 text-muted-foreground" />
              <Label className="text-sm">Initial tool subset</Label>
              <Badge variant="outline" className="tabular-nums">
                {enabled.size} of {filteredVirtuals.length}
              </Badge>
            </div>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter…"
              className="h-8 max-w-[200px] border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
          <ScrollArea className="h-[36vh]">
            <ul className="grid gap-1.5 p-3">
              {filteredVirtuals.map((t) => {
                const on = enabled.has(t.name);
                return (
                  <li key={t.name}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border bg-card/40 p-2.5 transition-colors hover:bg-accent/40",
                        on && "border-(--accent)",
                      )}
                      style={on ? ({ ["--accent" as string]: color } as React.CSSProperties) : undefined}
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={() =>
                          setEnabled((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.name)) next.delete(t.name); else next.add(t.name);
                            return next;
                          })
                        }
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
              {filteredVirtuals.length === 0 && (
                <li className="py-12 text-center text-sm text-muted-foreground">no virtuals match.</li>
              )}
            </ul>
          </ScrollArea>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card className="overflow-hidden p-0">
          <div className="px-4 pt-4 text-xs uppercase tracking-wider text-muted-foreground">Preview</div>
          <div className="m-4 mt-2 rounded-xl border bg-card/50 p-4" style={{ borderColor: color }}>
            <div className="flex items-center gap-3">
              <div
                className="grid size-10 place-items-center rounded-xl border text-xl"
                style={{ borderColor: color, color, background: `color-mix(in oklab, ${color} 10%, transparent)` }}
              >
                {glyph}
              </div>
              <div>
                <div className="font-semibold tracking-tight">{label || "Your persona"}</div>
                <div className="text-[11px] text-muted-foreground">{id || "your-id"}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{tagline || "Add a tagline above."}</p>
          </div>
        </Card>

        <Card className="space-y-2 p-4 text-xs leading-relaxed text-muted-foreground">
          <div className="flex items-center gap-2 text-foreground">
            <Sparkles className="size-3.5" /> what happens on save
          </div>
          <ol className="ml-4 list-decimal space-y-1">
            <li>Writes <code className="font-mono">data/personas/{id || "id"}.json</code> + <code className="font-mono">.yaml</code></li>
            <li>The next time you chat, the orchestrator spawns a goose-runner with this recipe</li>
            <li>You can keep curating tools on the next page</li>
          </ol>
        </Card>

        <Button
          onClick={submit}
          disabled={!valid || pending}
          className="text-background"
          style={{ background: color }}
        >
          {pending ? "creating…" : "create persona"}
        </Button>
      </aside>
    </div>
  );
}
