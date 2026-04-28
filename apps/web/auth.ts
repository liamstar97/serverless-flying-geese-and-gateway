import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

// JWT strategy: no session DB. The mapping that *does* need persistence
// ((user, persona, session) -> goose container) lives in lib/sessions.ts.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
});
