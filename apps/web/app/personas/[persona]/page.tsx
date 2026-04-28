import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getPersona, getAvailableTools, readRecipe } from "@/lib/persona-store";
import { listGatewayTools } from "@/lib/gateway";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { PersonaEditor } from "./PersonaEditor";

export const dynamic = "force-dynamic";

export default async function PersonaEditPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { persona } = await params;
  const meta = getPersona(persona);
  if (!meta) notFound();
  const accent = meta.color;

  let allTools: { name: string; description?: string }[] = [];
  let gatewayError: string | null = null;
  try { allTools = await listGatewayTools(); } catch (e) { gatewayError = (e as Error).message; }

  const recipe = readRecipe(meta.id);
  const enabled = new Set(getAvailableTools(meta.id));
  const instructions = recipe.instructions ?? "";

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">← personas</Link>
        <span>/</span>
        <Link href={`/chat/${meta.id}`} className="hover:text-foreground">{meta.label}</Link>
      </div>

      <header
        className="mb-6 flex items-center justify-between rounded-2xl border bg-card p-5 shadow-sm"
        style={{ borderColor: accent }}
      >
        <div className="flex items-center gap-4">
          <div
            className="grid size-12 place-items-center rounded-xl border text-2xl"
            style={{ borderColor: accent, color: accent, background: `color-mix(in oklab, ${accent} 10%, transparent)` }}
          >
            {meta.glyph}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{meta.label}</h1>
              <Badge variant="outline" className="border-(--accent) text-(--accent)" style={{ ["--accent" as string]: accent }}>
                {meta.id}.yaml
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{meta.tagline}</p>
          </div>
        </div>
        <Link href={`/chat/${meta.id}`}>
          <Button variant="ghost" size="sm">go to chat →</Button>
        </Link>
      </header>

      {gatewayError && (
        <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          gateway unreachable: {gatewayError}
        </div>
      )}

      <PersonaEditor
        persona={meta.id}
        accentColor={accent}
        allTools={allTools}
        initialEnabled={[...enabled].sort()}
        initialInstructions={instructions}
      />
    </div>
  );
}
