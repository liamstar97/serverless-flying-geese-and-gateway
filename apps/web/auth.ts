import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

// In production we sit behind Fly's proxy: the app receives plain HTTP
// while the browser sees HTTPS. Auth.js's auto cookie-name + Secure-flag
// detection sometimes picks the wrong scheme depending on which header
// it inspects, leading to InvalidCheck: pkceCodeVerifier on the OAuth
// callback. Pinning everything explicitly is reliable.
const useSecureCookies = (process.env.AUTH_URL ?? "").startsWith("https://");
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

// Comma-separated GitHub logins (case-insensitive) allowed to sign in.
// Empty = open to anyone. Set via Fly secret `ALLOWED_GITHUB_LOGINS`.
const ALLOWLIST = (process.env.ALLOWED_GITHUB_LOGINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// JWT strategy: no session DB. The mapping that *does* need persistence
// ((user, persona, session) -> goose container) lives in lib/sessions.ts.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  trustHost: true,
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}authjs.session-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    callbackUrl: {
      name: `${cookiePrefix}authjs.callback-url`,
      options: { sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    csrfToken: {
      name: `${useSecureCookies ? "__Host-" : ""}authjs.csrf-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    pkceCodeVerifier: {
      name: `${cookiePrefix}authjs.pkce.code_verifier`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies, maxAge: 60 * 15 },
    },
    state: {
      name: `${cookiePrefix}authjs.state`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies, maxAge: 60 * 15 },
    },
    nonce: {
      name: `${cookiePrefix}authjs.nonce`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
  },
  callbacks: {
    async signIn({ profile }) {
      if (ALLOWLIST.length === 0) return true;
      const login = ((profile?.login as string | undefined) ?? "").toLowerCase();
      if (login && ALLOWLIST.includes(login)) return true;
      console.warn(`[auth] denied sign-in: github login=${login || "<unknown>"}`);
      // Returning false sends the user to /api/auth/error?error=AccessDenied.
      return false;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
});
