import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { isPersona, PERSONA_META } from "@/lib/personas";
import { ChatRoom } from "./ChatRoom";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    return null; // middleware redirects, but defense-in-depth
  }
  const { persona } = await params;
  if (!isPersona(persona)) notFound();

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "2rem 1.5rem", height: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ marginBottom: "1rem" }}>
        <a href="/" style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}>← personas</a>
        <h1 style={{ margin: "0.25rem 0" }}>{PERSONA_META[persona].label}</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>{PERSONA_META[persona].tagline}</p>
      </header>
      <ChatRoom persona={persona} />
    </main>
  );
}
