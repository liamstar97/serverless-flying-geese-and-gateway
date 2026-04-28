import { auth } from "@/auth";

const PROTECTED = ["/chat", "/personas", "/registry", "/tools"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!req.auth) {
      return Response.redirect(new URL("/", req.url));
    }
  }
});

export const config = {
  matcher: ["/chat/:path*", "/personas/:path*", "/registry/:path*", "/tools/:path*"],
};
