import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Dynamic import avoids pdf-parse test-file loading issue in Next.js
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);

    return NextResponse.json({ text: data.text, pages: data.numpages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PDF parse error:", message);
    return NextResponse.json({ error: "Failed to parse PDF" }, { status: 500 });
  }
}
