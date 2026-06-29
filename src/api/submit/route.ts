import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadZip } from "@/lib/cloudinary";
import { AssignmentKey, InstructorKey } from "@/generated/prisma/client";

const VALID_INSTRUCTOR_KEYS = new Set<InstructorKey>(["KIBROM", "ZELALEM"]);
const VALID_ASSIGNMENT_KEYS = new Set<AssignmentKey>([
  "A1_HTML_CSS",
  "A2_JS",
  "A2_BOOTSTRAP",
  "A3_WEB_PROJECT",
]);

// Assignment → allowed instructor mapping (prevents cross-submissions)
const ASSIGNMENT_INSTRUCTOR_MAP: Record<AssignmentKey, InstructorKey[]> = {
  A1_HTML_CSS:    ["KIBROM", "ZELALEM"],
  A2_JS:          ["KIBROM"],
  A2_BOOTSTRAP:   ["ZELALEM"],
  A3_WEB_PROJECT: ["KIBROM", "ZELALEM"],
};

function sanitizeUpperAlnum(value: string, maxLen: number): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // --- Extract fields ---
    const rawStudentId    = formData.get("studentId")    as string | null;
    const rawBatch        = formData.get("batch")        as string | null;
    const firstName       = (formData.get("firstName")   as string | null)?.trim();
    const lastName        = (formData.get("lastName")    as string | null)?.trim();
    const phone           = (formData.get("phone")       as string | null)?.trim() || null;
    const rawInstructor   = formData.get("instructorKey") as string | null;
    const rawAssignment   = formData.get("assignmentKey") as string | null;
    const file            = formData.get("file") as File | null;

    // --- Sanitize IDs ---
    const studentId = rawStudentId ? sanitizeUpperAlnum(rawStudentId, 6)  : "";
    const batch     = rawBatch     ? sanitizeUpperAlnum(rawBatch,     10) : "";

    // --- Validate required fields ---
    if (!studentId || studentId.length < 3) {
      return NextResponse.json(
        { error: "Invalid student ID." },
        { status: 400 }
      );
    }
    if (!batch || batch.length < 3) {
      return NextResponse.json(
        { error: "Invalid batch." },
        { status: 400 }
      );
    }
    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First and last name are required." },
        { status: 400 }
      );
    }
    if (!rawInstructor || !VALID_INSTRUCTOR_KEYS.has(rawInstructor as InstructorKey)) {
      return NextResponse.json(
        { error: "Invalid instructor." },
        { status: 400 }
      );
    }
    if (!rawAssignment || !VALID_ASSIGNMENT_KEYS.has(rawAssignment as AssignmentKey)) {
      return NextResponse.json(
        { error: "Invalid assignment." },
        { status: 400 }
      );
    }

    const instructorKey = rawInstructor as InstructorKey;
    const assignmentKey = rawAssignment as AssignmentKey;

    // Validate instructor ↔ assignment combination
    if (!ASSIGNMENT_INSTRUCTOR_MAP[assignmentKey].includes(instructorKey)) {
      return NextResponse.json(
        { error: "This assignment is not available for the selected instructor." },
        { status: 400 }
      );
    }

    // --- Validate file ---
    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { error: "Only .zip files are accepted." },
        { status: 400 }
      );
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File must be under 50 MB." },
        { status: 400 }
      );
    }

    // --- Check duplicate submission ---
    const existing = await prisma.submission.findUnique({
      where: {
        studentId_instructorKey_assignmentKey: {
          studentId,
          instructorKey,
          assignmentKey,
        },
      },
    });
    if (existing) {
      return NextResponse.json(
        {
          error:
            "You have already submitted this assignment. Contact your instructor if you need to resubmit.",
        },
        { status: 409 }
      );
    }

    // --- Upload to Cloudinary ---
    const buffer = Buffer.from(await file.arrayBuffer());
    const { secure_url, public_id } = await uploadZip(
      buffer,
      file.name,
      instructorKey,
      assignmentKey,
      studentId
    );

    // --- Get IP address ---
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // --- Write to DB ---
    await prisma.submission.create({
      data: {
        studentId,
        batch,
        firstName,
        lastName,
        phone,
        instructorKey,
        assignmentKey,
        zipUrl:      secure_url,
        filePublicId: public_id,
        fileName:    file.name,
        ipAddress,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[submit] error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}