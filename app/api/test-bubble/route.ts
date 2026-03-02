import { NextResponse } from "next/server";

// Matches exactly what notifyBubble() sends to Bubble on every quote update
const FULL_PAYLOAD = {
  quote_id: "bubble-quote-record-123",
  title: "Roof Replacement — GAF Timberline HDZ — 123 Main St",
  client_name: "John Smith",
  client_address: "123 Main St, Miami, FL 33101",
  items: [
    {
      name: "Permit & Inspection",
      description: "Building permit and city inspection fee",
      price: 350,
    },
    {
      name: "Tear-off",
      description: "Removal and disposal of existing 3-tab asphalt shingles",
      price: 3500,
    },
    {
      name: "Decking Repair",
      description: "Replace damaged or rotted roof decking boards (if applicable)",
      price: 4000,
    },
    {
      name: "Synthetic Underlayment",
      description: "GAF Tiger Paw synthetic underlayment — full coverage",
      price: 800,
    },
    {
      name: "Ice & Water Shield",
      description: "GAF WeatherWatch ice and water shield at eaves and valleys",
      price: 1000,
    },
    {
      name: "GAF Timberline HDZ Shingles",
      description: "Architectural dimensional shingles — lifetime warranty product",
      price: 17000,
    },
    {
      name: "Ridge Cap / Hip & Ridge",
      description: "GAF TimberTex premium ridge cap shingles along all hips and ridges",
      price: 360,
    },
    {
      name: "Drip Edge",
      description: "Aluminum drip edge installation along all roof edges",
      price: 400,
    },
    {
      name: "Pipe Flashings / Boots",
      description: "Rubber pipe boot flashings for all roof penetrations",
      price: 100,
    },
    {
      name: "Step & Counter Flashing",
      description: "Step flashing and counter flashing at walls and chimneys",
      price: 6000,
    },
    {
      name: "Labor — Installation",
      description: "Full roofing crew installation labor",
      price: 17000,
    },
    {
      name: "Cleanup & Haul-away",
      description: "Job site cleanup and debris removal",
      price: 250,
    },
  ],
  total: 50760,
  warranty:
    "10-year workmanship warranty. Manufacturer warranty per product (GAF Golden Pledge / CertainTeed SureStart Plus where applicable).",
  terms:
    "50% deposit required to schedule work. Remaining balance due upon completion and final inspection. Payment accepted: check, ACH, credit card (3% fee applies).",
  comments: "Price estimate based on standard residential re-roof. Final scope confirmed on-site.",
};

export async function GET() {
  const url = process.env.BUBBLE_WEBHOOK_URL;
  const key = process.env.BUBBLE_API_KEY;

  if (!url) {
    return NextResponse.json({
      ok: false,
      error: "BUBBLE_WEBHOOK_URL is not set in environment variables",
    });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(FULL_PAYLOAD),
    });

    const responseText = await res.text().catch(() => "");

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      bubble_url: url,
      bubble_response: responseText,
      payload_sent: FULL_PAYLOAD,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      bubble_url: url,
    });
  }
}
