import { auth } from "@/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/chat")) {
    if (!req.auth) {
      const url = new URL("/", req.url);
      return Response.redirect(url);
    }
  }
});

export const config = {
  matcher: ["/chat/:path*"],
};
