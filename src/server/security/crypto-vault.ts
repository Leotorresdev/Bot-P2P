import "server-only";
import crypto from "node:crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-gcm" as const;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const SESSION_COOKIE_NAME = "bot_p2p_session" as const;

function getMasterKey(): Buffer {
  return Buffer.from(env.MASTER_ENCRYPTION_KEY, "hex");
}

// =========================================================
// 1. HASHING SEGURO DE CONTRASEÑAS (SCRYPT + TIMING-SAFE)
// =========================================================

export function hashPassword(plainPassword: string): {
  readonly passwordHash: string;
  readonly passwordSalt: string;
} {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
  return {
    passwordHash: derivedKey.toString("hex"),
    passwordSalt: salt,
  };
}

export function verifyPasswordHash(
  plainPassword: string,
  storedHashHex: string,
  storedSaltHex: string
): boolean {
  try {
    const derivedKey = crypto.scryptSync(plainPassword, storedSaltHex, 64);
    const storedBuffer = Buffer.from(storedHashHex, "hex");
    if (derivedKey.length !== storedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, storedBuffer);
  } catch {
    return false;
  }
}

// =========================================================
// 2. GOOGLE AUTHENTICATOR TOTP (ESTÁNDAR RFC 6238)
// =========================================================

export function generateTotpSecret(length: number = 16): string {
  const bytes = crypto.randomBytes(length);
  let secret = "";
  for (let i = 0; i < length; i++) {
    const b = bytes[i] ?? 0;
    secret += BASE32_ALPHABET[b % 32];
  }
  return secret;
}

function decodeBase32(base32: string): Buffer {
  const cleaned = base32.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (!char) continue;
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpCode(
  secretBase32: string,
  windowOffset: number = 0
): string {
  const key = decodeBase32(secretBase32);
  const epochSeconds = Math.floor(Date.now() / 1000);
  const timeStep = Math.floor(epochSeconds / 30) + windowOffset;

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(timeStep), 0);

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const otp = binary % 1_000_000;
  return String(otp).padStart(6, "0");
}

export function verifyTotpCode(
  secretBase32: string,
  inputCode: string
): boolean {
  const cleanCode = inputCode.trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return false;
  }

  for (const offset of [-1, 0, 1]) {
    const expected = generateTotpCode(secretBase32, offset);
    if (expected === cleanCode) {
      return true;
    }
  }
  return false;
}

// =========================================================
// 3. TOKENS DE SESIÓN FIRMADOS (HMAC-SHA256 HTTP-ONLY)
// =========================================================

export interface SignedSessionPayload {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly exp: number;
}

export function createSignedSessionToken(user: {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}): string {
  const payload: SignedSessionPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    exp: Date.now() + 8 * 60 * 60 * 1000, // 8 horas de sesión
  };
  const dataB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signature = crypto
    .createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(dataB64)
    .digest("base64url");
  return `${dataB64}.${signature}`;
}

export function verifySignedSessionToken(
  token: string | undefined | null
): SignedSessionPayload | null {
  if (!token || !token.includes(".")) {
    return null;
  }
  const parts = token.split(".");
  const dataB64 = parts[0];
  const providedSig = parts[1];
  if (!dataB64 || !providedSig) {
    return null;
  }

  const expectedSig = crypto
    .createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(dataB64)
    .digest("base64url");

  const sigBufA = Buffer.from(providedSig);
  const sigBufB = Buffer.from(expectedSig);
  if (
    sigBufA.length !== sigBufB.length ||
    !crypto.timingSafeEqual(sigBufA, sigBufB)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(dataB64, "base64url").toString("utf8")
    ) as SignedSessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// =========================================================
// 4. BÓVEDA DE CREDENCIALES BINANCE (AES-256-GCM)
// =========================================================

export interface EncryptedVaultPayload {
  readonly apiKeyMasked: string;
  readonly apiKeyEncrypted: string;
  readonly apiSecretEncrypted: string;
  readonly iv: string;
  readonly authTag: string;
}

export function encryptBinanceCredentials(
  apiKey: string,
  apiSecret: string
): EncryptedVaultPayload {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const combinedPayload = JSON.stringify({ apiKey, apiSecret });

  const encryptedBuffer = Buffer.concat([
    cipher.update(combinedPayload, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const apiKeyMasked =
    apiKey.length >= 12
      ? `${apiKey.slice(0, 12)} •••••••• ${apiKey.slice(-4)}`
      : "••••••••••••";

  return {
    apiKeyMasked,
    apiKeyEncrypted: encryptedBuffer.toString("hex"),
    apiSecretEncrypted: "enc:aes256:server-only",
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

export function decryptBinanceCredentials(
  encryptedHex: string,
  ivHex: string,
  authTagHex: string
): { readonly apiKey: string; readonly apiSecret: string } {
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encryptedBuffer = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decryptedBuffer = Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final(),
  ]);

  const parsed = JSON.parse(decryptedBuffer.toString("utf8")) as {
    apiKey: string;
    apiSecret: string;
  };

  return {
    apiKey: parsed.apiKey,
    apiSecret: parsed.apiSecret,
  };
}

export function signBinanceQuery(
  queryString: string,
  apiSecret: string
): string {
  return crypto
    .createHmac("sha256", apiSecret)
    .update(queryString)
    .digest("hex");
}

export function generateClosingActaHash(payload: {
  readonly userId: string;
  readonly closingDate: string;
  readonly reconciledOrders: number;
  readonly grossProfitVes: string;
  readonly seniatTax16Ves: string;
  readonly netFreeProfitVes: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}
