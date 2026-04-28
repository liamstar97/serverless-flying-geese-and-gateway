import Link from "next/link";
import type { ReactNode } from "react";

import { auth, signOut } from "@/auth";
import { listPersonas } from "@/lib/persona-store";
import { listSessionsByUser } from "@/lib/sessions";
import { isContainerRunning } from "@/lib/orchestrator";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarPersonaList } from "@/components/SidebarPersonaList";

const NAV = [
  { href: "/", label: "Personas",       glyph: "❖" },
  { href: "/tools", label: "Tools",     glyph: "⌘" },
  { href: "/registry", label: "Registry", glyph: "⊞" },
] as const;

export async function AppShell({ children }: { children: ReactNode }) {
  const session = await auth();
  const userId =
    (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email ?? null;
  const personas = session?.user ? listPersonas() : [];
  // Initial live set verified against docker, so first paint reflects truth.
  // The client-side SidebarPersonaList re-polls every 5s.
  let initialLive: string[] = [];
  if (userId) {
    const rows = listSessionsByUser(userId);
    const live = await Promise.all(rows.map((r) => isContainerRunning(r.container_id)));
    initialLive = rows.filter((_, i) => live[i]).map((r) => r.persona);
  }

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
          {(() => {
            // Don't surface the link if the URL is only resolvable on Fly's
            // private 6PN — browsers can't follow .internal hostnames. The
            // env can be left unset in production until we add a server-
            // side proxy or expose the admin port publicly.
            const adminUrl = process.env.GATEWAY_ADMIN_URL ?? "http://localhost:15000/ui";
            const browserReachable = !adminUrl.includes(".internal");
            if (!browserReachable) return null;
            return (
              <a
                href={adminUrl}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-md px-3 py-1.5 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <span className="text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70">↗</span>
                Inspect gateway
              </a>
            );
          })()}
          {(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin && (
            <Link
              href="/admin/users"
              className="group flex items-center gap-3 rounded-md px-3 py-1.5 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <span className="text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70">⌗</span>
              Users
            </Link>
          )}
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
            <SidebarPersonaList personas={personas} initialLive={initialLive} />
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
