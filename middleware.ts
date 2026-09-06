import { NextResponse, type NextRequest } from "next/server";
import { getTokenFromCookie, verifySession, authSecret } from "@/lib/auth";

/**
 * Gate the app pages behind a valid session. API routes enforce auth
 * themselves; this only redirects unauthenticated page views to /login.
 */
export async function middleware(req: NextRequest) {
  const token = getTokenFromCookie(req.headers.get("cookie"));
  let authed = false;
  try {
    if (token) authed = (await verifySession(token, authSecret())) !== null;
  } catch {
    authed = false;
  }
  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Only guard the app pages; /login, /register, /api/* and assets are excluded.
export const config = {
  matcher: ["/", "/dashboard", "/contacts/:path*", "/households/:path*", "/settings", "/admin"],
};
