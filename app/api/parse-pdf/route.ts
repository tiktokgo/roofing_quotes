import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Use lib/pdf-parse.js directly to avoid pdf-parse's broken test-file
    // initialization that crashes on Vercel (tries to read test data from disk).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    const data = await pdfParse(buffer);

    return NextResponse.json({ text: data.text, pages: data.numpages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PDF parse error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
