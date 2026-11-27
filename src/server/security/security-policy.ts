export interface AllowedOriginOptions {
  readonly appUrl?: string;
  readonly publicAppUrl?: string;
  readonly vercelProductionUrl?: string;
  readonly vercelUrl?: string;
  readonly extraAllowedOrigins?: string;
  readonly requestUrl?: string;
  readonly nodeEnv?: string;
}

function normalizeOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * Valida si un encabezado `Origin` pertenece estrictamente a la lista blanca del proyecto.
 * Jamás acepta wildcards genéricos como `*.vercel.app` para evitar ataques CORS/CSRF
 * desde despliegues de terceros en Vercel.
 */
export function isAllowedOrigin(
  origin: string,
  options: AllowedOriginOptions = {}
): boolean {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const isDev = (options.nodeEnv ?? "development") !== "production";
  if (
    isDev &&
    (normalizedOrigin === "http://localhost:3000" ||
      normalizedOrigin === "http://127.0.0.1:3000" ||
      normalizedOrigin.startsWith("http://localhost:") ||
      normalizedOrigin.startsWith("http://127.0.0.1:"))
  ) {
    return true;
  }

  const allowed = new Set<string>();
  for (const candidate of [
    options.appUrl,
    options.publicAppUrl,
    options.vercelProductionUrl,
    options.vercelUrl,
    options.requestUrl,
  ]) {
    const parsed = normalizeOrigin(candidate);
    if (parsed) allowed.add(parsed);
  }

  if (options.extraAllowedOrigins) {
    for (const item of options.extraAllowedOrigins.split(",")) {
      const parsed = normalizeOrigin(item);
      if (parsed) allowed.add(parsed);
    }
  }

  return allowed.has(normalizedOrigin);
}

function decodeBase64UrlToBytes(input: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) return null;
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padLength);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Verifica criptográficamente la firma HMAC-SHA256 y la expiración de la cookie
 * `bot_p2p_session` usando Web Crypto API (`crypto.subtle`), compatible tanto con
 * Next.js Edge Middleware como con Node.js 24.
 */
export async function verifySessionTokenEdge(
  token: string | undefined | null,
  secret: string | undefined | null,
  nowMs: number = Date.now()
): Promise<boolean> {
  if (!token || !secret || secret.length < 16) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const dataB64 = parts[0];
  const sigB64 = parts[1];
  if (!dataB64 || !sigB64) return false;

  const sigBytes = decodeBase64UrlToBytes(sigB64);
  if (!sigBytes || sigBytes.length !== 32) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const isValidSig = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(dataB64)
    );
    if (!isValidSig) return false;

    const payloadBytes = decodeBase64UrlToBytes(dataB64);
    if (!payloadBytes) return false;

    const jsonStr = new TextDecoder("utf-8").decode(payloadBytes);
    const payload = JSON.parse(jsonStr) as { userId?: unknown; exp?: unknown };
    if (typeof payload.userId !== "string" || payload.userId.trim() === "") {
      return false;
    }
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return false;
    }
    return nowMs < payload.exp;
  } catch {
    return false;
  }
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  if (bytesA.length !== bytesB.length) return false;
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Valida la cabecera `Authorization: Bearer <CRON_SECRET>` para endpoints internos de cron.
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | undefined | null,
  expectedCronSecret: string | undefined | null
): boolean {
  if (!expectedCronSecret || expectedCronSecret.trim().length < 16) {
    return false;
  }
  if (!authorizationHeader) {
    return false;
  }
  const expectedHeader = `Bearer ${expectedCronSecret.trim()}`;
  return timingSafeEqualStrings(authorizationHeader.trim(), expectedHeader);
}
