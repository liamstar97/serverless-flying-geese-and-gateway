import Link from "next/link";

import { auth } from "@/auth";
import { listGatewayTools } from "@/lib/gateway";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const BUCKETS: Record<string, { label: string; description: string; tone: "primary" | "muted" }> = {
  virtual: { label: "Virtual / composed", description: "Composition primitives in the registry — scatter-gather, pipelines, arrayMap normalizers, forwarding aliases.", tone: "primary" },
  "search-service": { label: "search", description: "External search proxies (Exa, arXiv, GitHub, HuggingFace).", tone: "muted" },
  "fetch-service": { label: "fetch", description: "URL fetching and link extraction.", tone: "muted" },
  "entity-service": { label: "entity", description: "Knowledge graph entities (SQLite + sqlite-vec).", tone: "muted" },
  "category-service": { label: "category", description: "Hierarchical taxonomy.", tone: "muted" },
  "tag-service": { label: "tag", description: "Content tagging.", tone: "muted" },
  "catalog-service": { label: "catalog", description: "Product catalog with semantic search.", tone: "muted" },
  "cart-service": { label: "cart", description: "Shopping-cart state.", tone: "muted" },
  "order-service": { label: "order", description: "Order management.", tone: "muted" },
  "inventory-service": { label: "inventory", description: "Stock levels and adjustments.", tone: "muted" },
  "supplier-service": { label: "supplier", description: "Suppliers and POs.", tone: "muted" },
  other: { label: "other", description: "", tone: "muted" },
};

function bucket(name: string): string {
  if (name.startsWith("virtual_")) return "virtual";
  const u = name.indexOf("_");
  return u > 0 ? name.slice(0, u) : "other";
}

export default async function ToolsPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-sm text-muted-foreground">
        You need to <Link href="/" className="underline underline-offset-4">sign in</Link> first.
      </div>
    );
  }

  let tools: { name: string; description?: string }[] = [];
  let error: string | null = null;
  try { tools = await listGatewayTools(); } catch (e) { error = (e as Error).message; }

  const groups = new Map<string, { name: string; description?: string }[]>();
  for (const t of tools) {
    const k = bucket(t.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === "virtual" ? -1 : b === "virtual" ? 1 : a.localeCompare(b),
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live from gateway</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Tools surface</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pulled from <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">POST /mcp tools/list</code>.
            {tools.length > 0 && <> Exposing {tools.length} tools across {ordered.length} buckets.</>}
          </p>
        </div>
        <Link
          href={process.env.GATEWAY_ADMIN_URL ?? "http://localhost:15000/ui"}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          gateway UI ↗
        </Link>
      </div>

      {error && (
        <Card className="mb-6 border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          gateway unreachable: {error}
        </Card>
      )}

      <div className="space-y-8">
        {ordered.map(([key, items]) => {
          const meta = BUCKETS[key] ?? { label: key, description: "", tone: "muted" as const };
          return (
            <section key={key}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className={meta.tone === "primary" ? "text-lg font-semibold tracking-tight text-primary" : "text-lg font-semibold tracking-tight"}>
                  {meta.label} <span className="ml-2 text-sm font-normal text-muted-foreground">{items.length}</span>
                </h2>
                {meta.description && <span className="text-xs text-muted-foreground">{meta.description}</span>}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {items.map((t) => (
                  <Card key={t.name} className="border-border bg-card/60 p-3 transition-colors hover:border-primary/40">
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-sm text-primary">{t.name}</code>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{key === "virtual" ? "virtual" : "backend"}</Badge>
                    </div>
                    {t.description && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
