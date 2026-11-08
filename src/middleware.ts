import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "bot_p2p_session";

function isSessionStructureValid(token: string | undefined): boolean {
  if (!token || !token.includes(".")) return false;
  const parts = token.split(".");
  const dataB64 = parts[0];
  const sig = parts[1];
  if (!dataB64 || !sig || sig.length < 16) return false;

  try {
    const jsonStr = atob(dataB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(jsonStr) as { userId?: string; exp?: number };
    if (!payload.userId || !payload.exp) return false;
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = isSessionStructureValid(sessionToken);

  // 1. Proteger la ruta principal "/" -> Redirigir a "/login" si no hay sesión activa
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
