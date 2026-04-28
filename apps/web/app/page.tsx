import Link from "next/link";

import { auth, signIn } from "@/auth";
import { PERSONAS, PERSONA_META } from "@/lib/personas";
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
            Three goose personas behind one agentgateway. Sign in to spin up an
            ephemeral agent and watch it use composed virtual tools.
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

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pick a persona</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Spin up an agent</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PERSONAS.map((p) => {
          const meta = PERSONA_META[p];
          const warm = live.has(p);
          const accent = `var(--${meta.accent})`;
          return (
            <Card
              key={p}
              className="group relative h-full overflow-hidden border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-(--accent) hover:shadow-[0_0_0_1px_var(--accent)]"
              style={{ ["--accent" as string]: accent }}
            >
              <Link
                href={`/chat/${p}`}
                className="absolute inset-0 z-0"
                aria-label={`Chat with ${meta.label}`}
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
                  {meta.glyph}
                </div>
                <Badge
                  variant={warm ? "default" : "outline"}
                  className={cn(
                    "uppercase tracking-wider",
                    warm && "border-transparent text-background",
                  )}
                  style={warm ? { background: accent } : undefined}
                >
                  {warm ? "warm" : "cold"}
                </Badge>
              </div>
              <div className="relative z-10 mt-5 text-lg font-semibold tracking-tight">{meta.label}</div>
              <p className="relative z-10 mt-1 text-sm leading-relaxed text-muted-foreground">{meta.tagline}</p>

              <div className="relative z-10 mt-6 flex items-center gap-3 text-xs text-muted-foreground">
                <Link
                  href={`/personas/${p}`}
                  className="rounded-md border bg-background/50 px-2 py-1 transition-colors hover:border-(--accent) hover:text-(--accent)"
                >
                  edit recipe
                </Link>
                <span className="ml-auto text-foreground/40 transition-colors group-hover:text-foreground/70">chat →</span>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-10 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
        <div>
          <div className="text-foreground">10</div>
          MCP backends behind the gateway
        </div>
        <div>
          <div className="text-foreground">51</div>
          Composed virtual tools
        </div>
        <div>
          <div className="text-foreground">~300 ms</div>
          Cold-start to first token (Fly Machines)
        </div>
      </div>
    </div>
  );
}
