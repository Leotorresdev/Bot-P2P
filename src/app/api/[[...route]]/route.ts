import { handle } from "hono/vercel";
import { honoApp } from "@/server/hono/app";

// Obligatorio para compatibilidad con Prisma ORM y node:crypto (AES-256-GCM)
export const runtime = "nodejs";

export const GET = handle(honoApp);
export const POST = handle(honoApp);
export const PUT = handle(honoApp);
export const DELETE = handle(honoApp);
export const OPTIONS = handle(honoApp);
