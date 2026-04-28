import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { readRegistry, type ToolDef } from "@/lib/registry";

import { RegistryEditor } from "./RegistryEditor";

export const dynamic = "force-dynamic";

export default async function RegistryPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const reg = readRegistry();
  const tools: ToolDef[] = reg.tools ?? [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Live config</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Virtual-tool registry</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Edit composed tool definitions. The gateway hot-reloads this file every 10s, so
            your changes take effect on the next chat turn — no restart.
          </p>
        </div>
      </div>
      <RegistryEditor initialTools={tools} schemaVersion={reg.schemaVersion ?? "2.0"} />
    </div>
  );
}
