import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

import { admitOnSignIn, isAdmin } from "@/lib/users-store";

// In production we sit behind Fly's proxy: the app receives plain HTTP
// while the browser sees HTTPS. Auth.js's auto cookie-name + Secure-flag
// detection sometimes picks the wrong scheme depending on which header
// it inspects, leading to InvalidCheck: pkceCodeVerifier on the OAuth
// callback. Pinning everything explicitly is reliable.
const useSecureCookies = (process.env.AUTH_URL ?? "").startsWith("https://");
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

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
      const login = (profile?.login as string | undefined) ?? "";
      const role = admitOnSignIn(login);
      if (role) return true;
      console.warn(`[auth] denied sign-in: github login=${login || "<unknown>"}`);
      // Returning false sends the user to /api/auth/error?error=AccessDenied.
      return false;
    },
    async jwt({ token, profile }) {
      // Capture the GitHub login so the session callback can resolve admin status
      // without re-fetching from GitHub on every request.
      if (profile?.login) token.githubLogin = profile.login as string;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string; login?: string; isAdmin?: boolean }).id = token.sub;
        const login = (token.githubLogin as string | undefined) ?? "";
        (session.user as { login?: string; isAdmin?: boolean }).login = login;
        (session.user as { isAdmin?: boolean }).isAdmin = isAdmin(login);
      }
      return session;
    },
  },
});
