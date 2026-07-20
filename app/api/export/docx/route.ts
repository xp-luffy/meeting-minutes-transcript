import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { fetchExportData } from "@/lib/export/fetch-data";
import { buildMinutesDocx } from "@/lib/export/build-docx";
import { buildExportFilename, contentDispositionHeader } from "@/lib/export/filename";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/export/docx?meetingId=...
 *
 * Loads the meeting + latest minutes draft + resolutions + action items and
 * streams back a statutory-format Word document.
 *
 * 404 { error } if the meeting doesn't exist.
 * 400 { error: "Draft is empty" } if there's no draft or its body is empty.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get("meetingId");

  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const result = await fetchExportData(supabase, meetingId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { meeting, draft } = result.data;
    const buffer = await buildMinutesDocx(result.data);
    const filename = buildExportFilename(meeting.company_name, meeting.meeting_date, "docx", draft.status);

    await logAudit(supabase, {
      meetingId,
      entityType: "minutes_draft",
      entityId: draft.id,
      action: "export_docx",
      payload: { version: draft.version },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDispositionHeader(filename),
      },
    });
  } catch (err) {
    console.error("[export/docx] failed", err);
    return NextResponse.json({ error: "Failed to generate DOCX export" }, { status: 500 });
  }
}
