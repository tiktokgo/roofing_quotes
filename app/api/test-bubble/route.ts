import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const url = process.env.BUBBLE_WEBHOOK_URL;
  const key = process.env.BUBBLE_API_KEY;

  if (!url) {
    return Response.json({
      ok: false,
      error: "BUBBLE_WEBHOOK_URL is not set in environment variables",
    });
  }

  const testPayload = {
    userId: "test-user-123",
    quote: {
      title: "TEST — Roof Replacement",
      status: "draft",
      total: 9999,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(testPayload),
    });

    const responseText = await res.text().catch(() => "");

    return Response.json({
      ok: res.ok,
      status: res.status,
      bubble_url: url,
      auth_header_sent: !!key,
      bubble_response: responseText,
      payload_sent: testPayload,
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      bubble_url: url,
    });
  }
}
