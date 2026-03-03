import { NextRequest, NextResponse } from "next/server";

// pdfjs-dist (used internally by pdf-parse) calls DOMMatrix which is browser-only.
// Polyfill it for Node.js so the server-side text extraction doesn't crash.
if (typeof globalThis.DOMMatrix === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true; isIdentity = true;
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a; this.m12 = this.b;
        this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    multiply() { return new (globalThis as any).DOMMatrix(); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    translate() { return new (globalThis as any).DOMMatrix(); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scale()     { return new (globalThis as any).DOMMatrix(); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rotate()    { return new (globalThis as any).DOMMatrix(); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inverse()   { return new (globalThis as any).DOMMatrix(); }
    transformPoint(p?: { x?: number; y?: number }) {
      return { x: p?.x ?? 0, y: p?.y ?? 0, z: 0, w: 1 };
    }
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Use lib/pdf-parse.js directly (v1.1.1) to skip the broken test-file
    // initialisation in index.js that crashes on Vercel (reads test data from disk).
    // require() is inside the handler so the DOMMatrix polyfill above runs first.
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
