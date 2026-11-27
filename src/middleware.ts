import { NextResponse, type NextRequest } from "next/server";
import { verifySessionTokenEdge } from "@/server/security/security-policy";

const SESSION_COOKIE_NAME = "bot_p2p_session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = await verifySessionTokenEdge(
    sessionToken,
    process.env.BETTER_AUTH_SECRET
  );

  // 1. Proteger la ruta principal "/" -> Redirigir a "/login" si no hay sesión firmada válida
  if (pathname === "/" && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Si ya está autenticado y visita "/login", enviarlo directo a su panel "/"
  if (pathname === "/login" && isAuthenticated) {
    const dashboardUrl = new URL("/", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login"],
};
