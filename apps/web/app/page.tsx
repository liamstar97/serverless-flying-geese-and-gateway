import Link from "next/link";

import { auth, signIn, signOut } from "@/auth";
import { PERSONAS, PERSONA_META } from "@/lib/personas";

export default async function HomePage() {
  const session = await auth();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1 style={{ marginTop: 0 }}>gloop</h1>
      <p style={{ color: "var(--muted)" }}>
        Serverless goose agents on Fly, sharing one agentgateway. Pick a persona — each
        spawns a fresh goose machine with its own tool subset.
      </p>

      {!session?.user ? (
        <form
          action={async () => {
            "use server";
            await signIn("github");
          }}
          style={{ marginTop: "2rem" }}
        >
          <button type="submit">Sign in with GitHub</button>
        </form>
      ) : (
        <>
          <div style={{ marginTop: "2rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span>
              Signed in as <strong>{session.user.name ?? session.user.email}</strong>
            </span>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button type="submit">Sign out</button>
            </form>
          </div>

          <ul style={{ listStyle: "none", padding: 0, marginTop: "2rem", display: "grid", gap: "0.75rem" }}>
            {PERSONAS.map((p) => (
              <li key={p}>
                <Link
                  href={`/chat/${p}`}
                  style={{
                    display: "block",
                    padding: "1rem 1.25rem",
                    background: "var(--panel)",
                    border: "1px solid var(--panel-2)",
                    borderRadius: 12,
                    textDecoration: "none",
                    color: "var(--text)",
                  }}
                >
                  <strong>{PERSONA_META[p].label}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
                    {PERSONA_META[p].tagline}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
