import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listUsers } from "@/lib/users-store";

import { UsersAdmin } from "./UsersAdmin";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const session = await auth();
  const me = session?.user as { isAdmin?: boolean; login?: string } | undefined;
  if (!me?.isAdmin) redirect("/");

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Admin</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Anyone listed here can sign in. Anyone else gets bounced to{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">?error=AccessDenied</code>.
        </p>
      </div>
      <UsersAdmin
        initialUsers={listUsers()}
        meLogin={me.login ?? ""}
      />
    </div>
  );
}
