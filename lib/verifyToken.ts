import { createHmac, timingSafeEqual } from "crypto";

export interface CompanyData {
  name: string;
  address?: string;
  phone?: string;
  license?: string;
  insurance?: string;
}

export interface TokenPayload {
  company: CompanyData;
  userId?: string;
  expires: number;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  payload?: TokenPayload;
}

/**
 * Verifies a HMAC-SHA256 signed token from Bubble.
 *
 * Token format: base64url(header).base64url(payload).base64url(signature)
 * Signature = HMAC-SHA256(SHARED_SECRET, header + "." + payload)
 */
export function verifyToken(token: string): VerifyResult {
  const secret = process.env.SHARED_SECRET;
  if (!secret) {
    return { valid: false, reason: "Server misconfiguration: missing SHARED_SECRET" };
  }

  if (!token) {
    return { valid: false, reason: "Missing token" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, reason: "Malformed token" };
  }

  const [headerB64, payloadB64, sigB64] = parts;

  // Verify signature
  const expected = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  let sigMatch = false;
  try {
    sigMatch = timingSafeEqual(Buffer.from(expected), Buffer.from(sigB64));
  } catch {
    return { valid: false, reason: "Invalid signature format" };
  }

  if (!sigMatch) {
    return { valid: false, reason: "Invalid signature" };
  }

  // Decode payload
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "Malformed payload" };
  }

  // Check expiry
  if (payload.expires && Date.now() / 1000 > payload.expires) {
    return { valid: false, reason: "Token expired" };
  }

  if (!payload.company?.name) {
    return { valid: false, reason: "Missing company info in token" };
  }

  return { valid: true, payload };
}
