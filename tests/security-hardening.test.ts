import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  isAllowedOrigin,
  isAuthorizedCronRequest,
  verifySessionTokenEdge,
} from "@/server/security/security-policy";

function signTokenNode(
  payload: Record<string, unknown>,
  secret: string
): string {
  const dataB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", secret)
    .update(dataB64)
    .digest("base64url");
  return `${dataB64}.${sig}`;
}

test("isAllowedOrigin rechaza dominios ajenos *.vercel.app y acepta solo orígenes en lista blanca", () => {
  const prodOpts = {
    appUrl: "https://bot-p2-p.vercel.app",
    vercelProductionUrl: "bot-p2-p.vercel.app",
    requestUrl: "https://bot-p2-p.vercel.app/api/p2p/summary",
    nodeEnv: "production",
  };

  assert.equal(isAllowedOrigin("https://bot-p2-p.vercel.app", prodOpts), true);
  assert.equal(isAllowedOrigin("https://atacante.vercel.app", prodOpts), false);
  assert.equal(isAllowedOrigin("https://evil.com", prodOpts), false);
  assert.equal(isAllowedOrigin("http://localhost:3000", prodOpts), false);

  // En desarrollo sí permite localhost
  assert.equal(
    isAllowedOrigin("http://localhost:3000", {
      ...prodOpts,
      nodeEnv: "development",
    }),
    true
  );

  // Dominio extra explícito en ALLOWED_ORIGINS
  assert.equal(
    isAllowedOrigin("https://mi-dominio-p2p.com", {
      ...prodOpts,
      extraAllowedOrigins: "https://mi-dominio-p2p.com, https://app.otro.com",
    }),
    true
  );
});

test("verifySessionTokenEdge valida firma HMAC-SHA256 real y rechaza cookies falsas o alteradas", async () => {
  const secret =
    "8c4e9b2a7f1d6e3c5a0b9f8e7d2c4b6a1e3f5d7c9b0a2e4f6d8c1b3a5e7f9d0c";
  const now = Date.now();

  const validToken = signTokenNode(
    {
      userId: "usr_123",
      email: "operador@test.com",
      name: "José Ñáñez",
      exp: now + 60_000,
    },
    secret
  );

  assert.equal(await verifySessionTokenEdge(validToken, secret, now), true);

  // Cookie manipulada (firma falsa de 32+ chars que antes pasaba `sig.length >= 16`)
  const fakePayloadB64 = Buffer.from(
    JSON.stringify({ userId: "admin", exp: now + 999_999 }),
    "utf8"
  ).toString("base64url");
  const forgedToken = `${fakePayloadB64}.${"A".repeat(43)}`;
  assert.equal(await verifySessionTokenEdge(forgedToken, secret, now), false);

  // Firma válida con otro secreto
  const wrongSecretToken = signTokenNode(
    { userId: "usr_123", exp: now + 60_000 },
    "otro_secreto_completamente_distinto_1234567890"
  );
  assert.equal(
    await verifySessionTokenEdge(wrongSecretToken, secret, now),
    false
  );

  // Token expirado
  const expiredToken = signTokenNode(
    { userId: "usr_123", exp: now - 1_000 },
    secret
  );
  assert.equal(await verifySessionTokenEdge(expiredToken, secret, now), false);
});

test("isAuthorizedCronRequest protege /api/p2p/cron-daily-close con CRON_SECRET", () => {
  const cronSecret = "mi_secreto_cron_super_seguro_2026";

  assert.equal(isAuthorizedCronRequest(undefined, cronSecret), false);
  assert.equal(isAuthorizedCronRequest("Bearer incorrecto", cronSecret), false);
  assert.equal(isAuthorizedCronRequest(`Bearer ${cronSecret}`, undefined), false);
  assert.equal(isAuthorizedCronRequest(`Bearer ${cronSecret}`, cronSecret), true);
});
