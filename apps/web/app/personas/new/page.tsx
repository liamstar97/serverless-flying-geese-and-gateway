import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listGatewayTools } from "@/lib/gateway";

import { PersonaCreator } from "./PersonaCreator";

export const dynamic = "force-dynamic";

export default async function NewPersonaPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  let allTools: { name: string; description?: string }[] = [];
  let gatewayError: string | null = null;
  try { allTools = await listGatewayTools(); } catch (e) { gatewayError = (e as Error).message; }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">← personas</Link>
        <span>/</span>
        <span>new</span>
      </div>

      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Persona builder</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">New persona</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authors a YAML recipe + a metadata record. After creation you'll be dropped
          straight into the tool curator. Goose-runners are persona-agnostic; this just
          adds another row to the registry of personas.
        </p>
      </header>

      {gatewayError && (
        <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          gateway unreachable: {gatewayError}
        </div>
      )}

      <PersonaCreator allTools={allTools} />
    </div>
  );
}
