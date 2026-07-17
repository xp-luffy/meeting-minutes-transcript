import { NextResponse } from "next/server";
import mammoth from "mammoth";

/**
 * POST /api/parse-docx
 * Body: multipart/form-data with a `file` field containing a .docx document.
 *
 * Success: 200 { text: string, warnings: string[] }
 * Error:   400 { error } for a missing/wrong-type/corrupt file
 *          413 { error } if the file exceeds the size limit
 *          429 { error } if rate limited
 *
 * Stateless, unauthenticated parser (no session required) — this endpoint
 * only extracts raw text from an uploaded DOCX via mammoth and never touches
 * the database.
 */

// Ensure this runs in the Node.js runtime (mammoth needs Node's Buffer/zlib).
export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const DOCX_CONTENT_TYPE_FRAGMENT = "officedocument.wordprocessingml";

// --- Rate limiting ---------------------------------------------------------
// Simple in-memory sliding window, keyed by IP: max 10 requests / 60s.
// NOTE: this state is per-instance (module-level Map), so it resets on cold
// start and isn't shared across serverless instances — fine for v1, but a
// real deployment with multiple instances would need a shared store (e.g.
// Redis) for a hard global limit.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestTimestampsByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestTimestampsByIp.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestTimestampsByIp.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestTimestampsByIp.set(ip, recent);
  return false;
}

function isDocxFile(file: File): boolean {
  const nameLooksRight = file.name.toLowerCase().endsWith(".docx");
  const typeLooksRight = file.type.includes(DOCX_CONTENT_TYPE_FRAGMENT);
  // Accept if either signal matches — browsers are inconsistent about setting
  // `type` for .docx (some report application/octet-stream), and a renamed
  // file could pass the extension check without the right content type.
  return nameLooksRight || typeLooksRight;
}

export async function POST(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many upload requests — try again in a minute." },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "A `file` field is required" }, { status: 400 });
  }

  if (!isDocxFile(file)) {
    return NextResponse.json(
      { error: "Only .docx files are supported" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File is too large — the limit is 5 MB." },
      { status: 413 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });

    const warnings = result.messages.map((message) => message.message);

    return NextResponse.json({ text: result.value, warnings });
  } catch (err) {
    console.error("[parse-docx] failed to parse DOCX", err);
    return NextResponse.json(
      { error: "Could not read that DOCX — is it a valid Word file?" },
      { status: 400 },
    );
  }
}
