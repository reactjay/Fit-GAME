import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/join"];

// Optimistic redirect only: real session checks happen in server components and
// API routes, and authorization is enforced by Postgres row-level security.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/")));
  if (!isPublic && !request.cookies.has("ju_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/|ws|icon.svg|manifest.webmanifest|favicon.ico).*)"],
};
