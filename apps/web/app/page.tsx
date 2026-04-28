import Link from "next/link";
import { Plus } from "lucide-react";

import { auth, signIn } from "@/auth";
import { listPersonas } from "@/lib/persona-store";
import { listSessionsByUser } from "@/lib/sessions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border bg-card p-8 shadow-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">gloop</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Author goose personas, deploy them as ephemeral Fly Machines, and
            watch them use composed virtual tools through agentgateway.
          </p>
          <form
            action={async () => {
              "use server";
              await signIn("github");
            }}
            className="mt-6"
          >
            <Button type="submit" className="w-full">
              Continue with GitHub
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const userId = (session.user as { id?: string }).id ?? session.user.email ?? "anon";
  const live = new Map(listSessionsByUser(userId).map((r) => [r.persona, r]));
  const personas = listPersonas();

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {personas.length} persona{personas.length === 1 ? "" : "s"}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Spin up an agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each persona is a recipe + tool subset. Pick one to chat, or author a new one.
          </p>
        </div>
        <Link href="/personas/new">
          <Button className="gap-1"><Plus className="size-4" /> new persona</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {personas.map((p) => {
          const warm = live.has(p.id);
          const accent = p.color;
          return (
            <Card
              key={p.id}
              className="group relative h-full overflow-hidden border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-(--accent) hover:shadow-[0_0_0_1px_var(--accent)]"
              style={{ ["--accent" as string]: accent }}
            >
              <Link
                href={`/chat/${p.id}`}
                className="absolute inset-0 z-0"
                aria-label={`Chat with ${p.label}`}
              />
              <div
                className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full opacity-30 blur-3xl transition-opacity group-hover:opacity-60"
                style={{ background: accent }}
              />
              <div className="relative z-10 flex items-center justify-between">
                <div
                  className="grid size-10 place-items-center rounded-xl border text-xl"
                  style={{ borderColor: accent, color: accent, background: `color-mix(in oklab, ${accent} 8%, transparent)` }}
                >
                  {p.glyph}
                </div>
                <Badge
                  variant={warm ? "default" : "outline"}
                  className={cn("uppercase tracking-wider", warm && "border-transparent text-background")}
                  style={warm ? { background: accent } : undefined}
                >
                  {warm ? "warm" : "cold"}
                </Badge>
              </div>
              <div className="relative z-10 mt-5 text-lg font-semibold tracking-tight">{p.label}</div>
              <p className="relative z-10 mt-1 text-sm leading-relaxed text-muted-foreground">{p.tagline}</p>

              <div className="relative z-10 mt-6 flex items-center gap-3 text-xs text-muted-foreground">
                <Link
                  href={`/personas/${p.id}`}
                  className="rounded-md border bg-background/50 px-2 py-1 transition-colors hover:border-(--accent) hover:text-(--accent)"
                >
                  edit recipe
                </Link>
                <span className="ml-auto text-foreground/40 transition-colors group-hover:text-foreground/70">chat →</span>
              </div>
            </Card>
          );
        })}

        {/* "Add new persona" tile is always last so it doesn't disrupt scanning. */}
        <Link href="/personas/new" className="group">
          <Card className="grid h-full min-h-[210px] place-items-center border-dashed bg-card/30 text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-card/60 hover:text-foreground">
            <div className="flex flex-col items-center gap-2">
              <Plus className="size-6" />
              <span className="text-sm font-medium">new persona</span>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
