import { handle } from "hono/vercel";
import { honoApp } from "@/server/hono/app";

// Obligatorio para compatibilidad con Prisma ORM y node:crypto (AES-256-GCM)
// Desactiva por completo el caché de producción en Next.js / Vercel y extiende maxDuration a 60s
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

export const GET = handle(honoApp);
export const POST = handle(honoApp);
export const PUT = handle(honoApp);
export const DELETE = handle(honoApp);
export const OPTIONS = handle(honoApp);
