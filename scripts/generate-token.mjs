/**
 * Run with: node scripts/generate-token.mjs
 * Generates a test JWT token you can paste into the browser URL.
 *
 * Set SHARED_SECRET to match your .env.local / Vercel env var.
 */

import { createHmac } from "crypto";

const SHARED_SECRET = process.env.SHARED_SECRET ?? "your-strong-secret-here";

const payload = {
  company: {
    name: "ABC Roofing LLC",
    address: "456 Business Ave, Miami, FL 33101",
    phone: "305-555-1234",
    license: "CCC1234567",
    insurance: "GL-9876543",
  },
  userId: "test-user-001",
  expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours from now
};

const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = createHmac("sha256", SHARED_SECRET).update(`${header}.${payloadB64}`).digest("base64url");

const token = `${header}.${payloadB64}.${sig}`;

console.log("\n=== TEST TOKEN ===\n");
console.log(token);
console.log("\n=== TEST URL ===\n");
console.log(`http://localhost:3000/chat?token=${encodeURIComponent(token)}`);
console.log(`https://roofing-quotes-neon.vercel.app/chat?token=${encodeURIComponent(token)}`);
console.log("");
