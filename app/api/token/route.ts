import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

/**
 * POST /api/token
 *
 * Bubble calls this to get a signed token for a specific contractor.
 * Body: { api_key, company: { name, address, phone, license, insurance }, userId, expiresInHours? }
 * Returns: { token }
 *
 * Bubble then builds the iframe URL:
 *   https://roofing-quotes-neon.vercel.app/chat?token=<token>
 */
export async function POST(req: NextRequest) {
  const SHARED_SECRET = process.env.SHARED_SECRET;
  const API_KEY = process.env.TOKEN_API_KEY;

  if (!SHARED_SECRET) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  try {
    // Bubble sometimes sends literal newlines/control chars inside JSON string values.
    // Read as raw text, strip bad control characters, then parse manually.
    const raw = await req.text();
    const sanitized = raw
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
      .replace(/\r?\n/g, " ");
    const body = JSON.parse(sanitized);

    // Verify Bubble's API key (simple secret to prevent unauthorized token generation)
    if (API_KEY && body.api_key !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { company, userId } = body;
    if (!company?.name) {
      return NextResponse.json({ error: "Missing company.name" }, { status: 400 });
    }

    const expiresInHours = typeof body.expiresInHours === "number" ? body.expiresInHours : 24;

    const payload = {
      company: {
        name: company.name,
        address: company.address ?? "",
        phone: company.phone ?? "",
        license: company.license ?? "",
        insurance: company.insurance ?? "",
      },
      userId: userId ?? "",
      expires: Math.floor(Date.now() / 1000) + expiresInHours * 3600,
    };

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", SHARED_SECRET)
      .update(`${header}.${payloadB64}`)
      .digest("base64url");

    const token = `${header}.${payloadB64}.${sig}`;

    return NextResponse.json({ token });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
