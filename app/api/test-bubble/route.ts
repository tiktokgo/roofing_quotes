import { NextResponse } from "next/server";

// Full payload with every field the AI can send — used to initialize Bubble's workflow schema
const FULL_PAYLOAD = {
  quote_id: "bubble-quote-record-123",
  quote: {
    title: "Roof Replacement — GAF Timberline HDZ — 123 Main St",
    date: "2026-03-02",
    scope: "Full tear-off and replacement with GAF Timberline HDZ architectural shingles",
    status: "draft",
    client: {
      name: "John Smith",
      address: "123 Main St, Miami, FL 33101",
      phone: "555-123-4567",
      email: "john@example.com",
    },
    items: [
      {
        name: "Permit & Inspection",
        description: "Building permit and city inspection fee",
        quantity: 1,
        unit: "job",
        unit_price: 350,
        total: 350,
      },
      {
        name: "Tear-off",
        description: "Removal and disposal of existing 3-tab asphalt shingles",
        quantity: 2000,
        unit: "sq ft",
        unit_price: 1.75,
        total: 3500,
      },
      {
        name: "Decking Repair",
        description: "Replace damaged or rotted roof decking boards (if applicable)",
        quantity: 2000,
        unit: "sq ft",
        unit_price: 2.0,
        total: 4000,
      },
      {
        name: "Synthetic Underlayment",
        description: "GAF Tiger Paw synthetic underlayment — full coverage",
        quantity: 2000,
        unit: "sq ft",
        unit_price: 0.4,
        total: 800,
      },
      {
        name: "Ice & Water Shield",
        description: "GAF WeatherWatch ice and water shield at eaves and valleys",
        quantity: 2000,
        unit: "sq ft",
        unit_price: 0.5,
        total: 1000,
      },
      {
        name: "GAF Timberline HDZ Shingles",
        description: "Architectural dimensional shingles — lifetime warranty product",
        quantity: 2000,
        unit: "sq ft",
        unit_price: 8.5,
        total: 17000,
      },
      {
        name: "Ridge Cap / Hip & Ridge",
        description: "GAF TimberTex premium ridge cap shingles along all hips and ridges",
        quantity: 120,
        unit: "linear ft",
        unit_price: 3.0,
        total: 360,
      },
      {
        name: "Drip Edge",
        description: "Aluminum drip edge installation along all roof edges",
        quantity: 200,
        unit: "linear ft",
        unit_price: 2.0,
        total: 400,
      },
      {
        name: "Pipe Flashings / Boots",
        description: "Rubber pipe boot flashings for all roof penetrations",
        quantity: 4,
        unit: "each",
        unit_price: 25,
        total: 100,
      },
      {
        name: "Step & Counter Flashing",
        description: "Step flashing and counter flashing at walls and chimneys",
        quantity: 2000,
        unit: "sq ft",
        unit_price: 3.0,
        total: 6000,
      },
      {
        name: "Labor — Installation",
        description: "Full roofing crew installation labor",
        quantity: 2000,
        unit: "sq ft",
        unit_price: 8.5,
        total: 17000,
      },
      {
        name: "Cleanup & Haul-away",
        description: "Job site cleanup and debris removal",
        quantity: 1,
        unit: "job",
        unit_price: 250,
        total: 250,
      },
    ],
    subtotal: 50760,
    tax_rate: 0.07,
    tax: 3553.2,
    total: 54313.2,
    warranty:
      "10-year workmanship warranty. Manufacturer warranty per product (GAF Golden Pledge / CertainTeed SureStart Plus where applicable).",
    terms:
      "50% deposit required to schedule work. Remaining balance due upon completion and final inspection. Payment accepted: check, ACH, credit card (3% fee applies).",
    comments: "Price estimate based on standard residential re-roof. Final scope confirmed on-site.",
  },
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
      auth_header_sent: !!key,
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
