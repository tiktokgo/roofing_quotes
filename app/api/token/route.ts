import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

/**
 * POST /api/token
 *
 * Bubble calls this to get a signed token for a specific contractor.
 *
 * Body:
 * {
 *   api_key: string,
 *   company_name: string,          // required — used in quote content
 *   user_name?: string,            // contractor's first name
 *   service_area?: string,         // e.g. "Miami, FL"
 *   default_tax_rate?: number,     // e.g. 0.07
 *   pricing_reference?: {
 *     sq_ft_rate_installed?: number,
 *     tear_off_rate?: number,
 *     preferred_brand?: string,
 *     preferred_shingle?: string,
 *   },
 *   userId?: string,
 *   expiresInHours?: number,       // default 24
 * }
 *
 * Returns: { token }
 */
export async function POST(req: NextRequest) {
  const SHARED_SECRET = process.env.SHARED_SECRET;
  const API_KEY = process.env.TOKEN_API_KEY;

  if (!SHARED_SECRET) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  try {
    // Bubble sometimes sends literal newlines/control chars inside JSON string values.
    const raw = await req.text();
    const sanitized = raw
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
      .replace(/\r?\n/g, " ");
    const body = JSON.parse(sanitized);

    // Verify Bubble's API key
    if (API_KEY && body.api_key !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!body.company_name) {
      return NextResponse.json({ error: "Missing company_name" }, { status: 400 });
    }

    const expiresInHours = typeof body.expiresInHours === "number" ? body.expiresInHours : 24;

    const payload = {
      company_name: body.company_name,
      user_name: body.user_name ?? undefined,
      service_area: body.service_area ?? undefined,
      default_tax_rate: typeof body.default_tax_rate === "number" ? body.default_tax_rate : undefined,
      pricing_reference: body.pricing_reference ?? undefined,
      userId: body.userId ?? undefined,
      expires: Math.floor(Date.now() / 1000) + expiresInHours * 3600,
    };

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", SHARED_SECRET)
      .update(`${header}.${payloadB64}`)
      .digest("base64url");

    return NextResponse.json({ token: `${header}.${payloadB64}.${sig}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
