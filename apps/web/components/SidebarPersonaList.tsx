"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { PersonaConfig } from "@/lib/persona-types";
import { cn } from "@/lib/utils";

export function SidebarPersonaList({
  personas,
  initialLive,
}: {
  personas: PersonaConfig[];
  initialLive: string[];
}) {
  const [live, setLive] = useState<Set<string>>(new Set(initialLive));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch("/api/personas/live", { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status}`);
        const body = (await res.json()) as { live: string[] };
        if (!cancelled) setLive(new Set(body.live));
      } catch {
        // swallow — we'll retry on the next interval
      }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 5000);

    // Pause polling while the tab is hidden — saves docker inspect calls.
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
      } else if (!timer) {
        timer = setTimeout(tick, 0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <nav className="mt-1 flex max-h-[40svh] flex-col gap-0.5 overflow-y-auto px-3 text-sm">
      {personas.map((p) => {
        const isLive = live.has(p.id);
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
              title={isLive ? "machine warm" : "no machine"}
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full transition-colors", isLive ? "gloop-pulse" : "bg-sidebar-foreground/20")}
              style={isLive ? { background: p.color, color: p.color } : undefined}
            />
          </Link>
        );
      })}
    </nav>
  );
}
