import { createHmac, timingSafeEqual } from "crypto";

export interface PricingReference {
  sq_ft_rate_installed?: number;
  tear_off_rate?: number;
  preferred_brand?: string;   // e.g. "GAF", "CertainTeed"
  preferred_shingle?: string; // e.g. "Timberline HDZ"
}

/** What the AI needs + quoteId to associate updates with the right Bubble record */
export interface AIContext {
  company_name: string;
  user_name?: string;          // contractor's first name — for greeting
  service_area?: string;       // e.g. "Miami, FL" — for localized pricing
  default_tax_rate?: number;   // e.g. 0.07
  pricing_reference?: PricingReference;
  quoteId?: string;            // Bubble Quote record ID — returned with every webhook call
}

export interface TokenPayload extends AIContext {
  quoteId?: string;
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

  if (!payload.company_name) {
    return { valid: false, reason: "Missing company_name in token" };
  }

  return { valid: true, payload };
}
