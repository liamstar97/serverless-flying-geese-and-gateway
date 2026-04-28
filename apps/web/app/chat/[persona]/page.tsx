import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { getPersona } from "@/lib/persona-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ChatRoom } from "./ChatRoom";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { persona } = await params;
  const meta = getPersona(persona);
  if (!meta) notFound();
  const accent = meta.color;

  return (
    <div className="mx-auto flex h-svh max-w-4xl flex-col px-6 py-6">
      <header
        className="mb-4 flex items-center justify-between rounded-2xl border bg-card p-4 shadow-sm"
        style={{ borderColor: accent }}
      >
        <div className="flex items-center gap-3">
          <div
            className="grid size-10 place-items-center rounded-xl border text-xl"
            style={{ borderColor: accent, color: accent, background: `color-mix(in oklab, ${accent} 10%, transparent)` }}
          >
            {meta.glyph}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{meta.label}</h1>
              <Badge variant="outline" className="border-(--accent) text-(--accent)" style={{ ["--accent" as string]: accent }}>
                goose
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{meta.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/personas/${meta.id}`}>
            <Button variant="ghost" size="sm">edit recipe</Button>
          </Link>
        </div>
      </header>

      <ChatRoom persona={meta.id} accentColor={accent} />
    </div>
  );
}
