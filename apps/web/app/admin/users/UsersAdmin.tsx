"use client";

import { useState, useTransition } from "react";
import { Trash2, ShieldCheck, Shield, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { addUserAction, removeUserAction, setRoleAction } from "./actions";

type Role = "admin" | "user";
interface UserRow { login: string; role: Role; added_at: number; added_by: string | null }

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function UsersAdmin({
  initialUsers,
  meLogin,
}: {
  initialUsers: UserRow[];
  meLogin: string;
}) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [draftLogin, setDraftLogin] = useState("");
  const [draftRole, setDraftRole] = useState<Role>("user");
  const [pending, startTransition] = useTransition();

  const adminCount = users.filter((u) => u.role === "admin").length;
  const isLastAdmin = (login: string) =>
    users.find((u) => u.login === login)?.role === "admin" && adminCount === 1;

  const add = () => {
    const login = draftLogin.trim().toLowerCase();
    if (!login) return;
    startTransition(async () => {
      const res = await addUserAction({ login, role: draftRole });
      if (res?.error) toast.error(res.error);
      else if (res?.user) {
        setUsers((prev) => [...prev, res.user!]);
        setDraftLogin("");
        toast.success(`${res.user.login} added`);
      }
    });
  };

  const remove = (login: string) => {
    if (login === meLogin) {
      toast.error("can't remove yourself");
      return;
    }
    if (isLastAdmin(login)) {
      toast.error("can't remove the last admin");
      return;
    }
    if (!confirm(`Remove ${login}?`)) return;
    startTransition(async () => {
      const res = await removeUserAction({ login });
      if (res?.error) toast.error(res.error);
      else {
        setUsers((prev) => prev.filter((u) => u.login !== login));
        toast.success(`${login} removed`);
      }
    });
  };

  const setRole = (login: string, role: Role) => {
    if (login === meLogin && role === "user" && adminCount === 1) {
      toast.error("can't demote the last admin");
      return;
    }
    startTransition(async () => {
      const res = await setRoleAction({ login, role });
      if (res?.error) toast.error(res.error);
      else {
        setUsers((prev) => prev.map((u) => (u.login === login ? { ...u, role } : u)));
        toast.success(`${login} -> ${role}`);
      }
    });
  };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-muted-foreground" />
          <Label className="text-sm">Invite a GitHub user</Label>
        </div>
        <div className="mt-3 grid grid-cols-[1fr,160px,auto] gap-2">
          <Input
            value={draftLogin}
            onChange={(e) => setDraftLogin(e.target.value)}
            placeholder="github-login"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="font-mono text-sm"
          />
          <Select value={draftRole} onValueChange={(v) => setDraftRole(v as Role)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="user">user</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={add} disabled={pending || !draftLogin.trim()}>add</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          GitHub login (case-insensitive). Saved to <code className="font-mono">data/sessions.db users</code>.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b bg-card px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          {users.length} member{users.length === 1 ? "" : "s"} · {adminCount} admin{adminCount === 1 ? "" : "s"}
        </div>
        <ul className="divide-y">
          {users.map((u) => {
            const itsMe = u.login === meLogin;
            return (
              <li key={u.login} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <code className="font-mono text-sm">{u.login}</code>
                  {itsMe && <Badge variant="outline" className="text-[10px] uppercase">you</Badge>}
                  <Badge
                    variant={u.role === "admin" ? "default" : "outline"}
                    className="text-[10px] uppercase tracking-wider"
                  >
                    {u.role}
                  </Badge>
                  <span className="text-xs text-muted-foreground">added {fmt(u.added_at)}</span>
                  {u.added_by && <span className="text-xs text-muted-foreground/70">by {u.added_by}</span>}
                </div>
                <div className="flex items-center gap-1">
                  {u.role === "user" ? (
                    <Button
                      variant="ghost" size="sm" disabled={pending}
                      onClick={() => setRole(u.login, "admin")}
                      title="Promote to admin"
                    >
                      <ShieldCheck className="size-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost" size="sm"
                      disabled={pending || (itsMe && adminCount === 1)}
                      onClick={() => setRole(u.login, "user")}
                      title={itsMe && adminCount === 1 ? "can't demote the last admin" : "Demote to user"}
                    >
                      <Shield className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    disabled={pending || itsMe || isLastAdmin(u.login)}
                    onClick={() => remove(u.login)}
                    className="text-destructive"
                    title={itsMe ? "can't remove yourself" : isLastAdmin(u.login) ? "can't remove the last admin" : "Remove"}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
          {users.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">no users yet</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
