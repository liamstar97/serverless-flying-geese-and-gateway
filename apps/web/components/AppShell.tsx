import Link from "next/link";
import type { ReactNode } from "react";

import { auth, signOut } from "@/auth";
import { listPersonas } from "@/lib/persona-store";
import { listSessionsByUser } from "@/lib/sessions";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Personas",       glyph: "❖" },
  { href: "/tools", label: "Tools",     glyph: "⌘" },
  { href: "/registry", label: "Registry", glyph: "⊞" },
] as const;

export async function AppShell({ children }: { children: ReactNode }) {
  const session = await auth();
  const userId =
    (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email ?? null;
  const liveByPersona = new Map<string, boolean>();
  if (userId) {
    for (const row of listSessionsByUser(userId)) liveByPersona.set(row.persona, true);
  }
  const personas = session?.user ? listPersonas() : [];

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <Link
          href="/"
          className="flex items-center gap-2 px-5 py-5 text-base font-semibold tracking-tight"
        >
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
            ⌬
          </span>
          gloop
        </Link>

        <nav className="mt-2 flex flex-col gap-0.5 px-3 text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="group flex items-center gap-3 rounded-md px-3 py-1.5 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <span className="text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70">{n.glyph}</span>
              {n.label}
            </Link>
          ))}
          <a
            href={process.env.GATEWAY_ADMIN_URL ?? "http://localhost:15000/ui"}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-md px-3 py-1.5 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <span className="text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70">↗</span>
            Inspect gateway
          </a>
        </nav>

        {personas.length > 0 && (
          <>
            <Separator className="mx-3 my-3 bg-sidebar-border" />
            <div className="flex items-center justify-between px-3 text-xs uppercase tracking-wider text-sidebar-foreground/40">
              <span>Personas</span>
              <Link href="/personas/new" className="text-sidebar-foreground/40 hover:text-sidebar-foreground" aria-label="New persona">
                +
              </Link>
            </div>
            <nav className="mt-1 flex max-h-[40svh] flex-col gap-0.5 overflow-y-auto px-3 text-sm">
              {personas.map((p) => {
                const live = liveByPersona.get(p.id) ?? false;
                return (
                  <Link
                    key={p.id}
                    href={`/chat/${p.id}`}
                    className="group flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="text-base" style={{ color: p.color }}>{p.glyph}</span>
                      <span className="truncate">{p.label}</span>
                    </span>
                    <span
                      aria-hidden
                      title={live ? "machine warm" : "no machine"}
                      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", live ? "gloop-pulse" : "bg-sidebar-foreground/20")}
                      style={live ? { background: p.color, color: p.color } : undefined}
                    />
                  </Link>
                );
              })}
            </nav>
          </>
        )}

        <div className="mt-auto px-3 py-3 text-xs">
          {session?.user ? (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sidebar-foreground/70">{session.user.name ?? session.user.email}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button type="submit" variant="ghost" size="sm" className="h-7 px-2 text-xs">Sign out</Button>
              </form>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
