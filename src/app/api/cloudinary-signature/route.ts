import { NextRequest, NextResponse } from "next/server";
import { getUploadSignature } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
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
  A2_JS:          ["ZELALEM"],
  A2_BOOTSTRAP:   ["KIBROM"],
  A3_WEB_PROJECT: ["KIBROM", "ZELALEM"],
};

function sanitizeUpperAlnum(value: string, maxLen: number): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, maxLen);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const rawStudentId  = searchParams.get("studentId");
    const rawInstructor = searchParams.get("instructorKey");
    const rawAssignment = searchParams.get("assignmentKey");
    const fileName      = searchParams.get("fileName");

    const studentId = rawStudentId ? sanitizeUpperAlnum(rawStudentId, 6) : "";
    const instructorKey = rawInstructor as InstructorKey | null;
    const assignmentKey = rawAssignment as AssignmentKey | null;

    if (!studentId || studentId.length < 3) {
      return NextResponse.json(
        { error: "Invalid student ID." },
        { status: 400 }
      );
    }
    if (!instructorKey || !VALID_INSTRUCTOR_KEYS.has(instructorKey)) {
      return NextResponse.json(
        { error: "Invalid instructor." },
        { status: 400 }
      );
    }
    if (!assignmentKey || !VALID_ASSIGNMENT_KEYS.has(assignmentKey)) {
      return NextResponse.json(
        { error: "Invalid assignment." },
        { status: 400 }
      );
    }
    if (!ASSIGNMENT_INSTRUCTOR_MAP[assignmentKey].includes(instructorKey)) {
      return NextResponse.json(
        { error: "This assignment is not available for the selected instructor." },
        { status: 400 }
      );
    }
    if (!fileName || !fileName.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { error: "Only .zip files are accepted." },
        { status: 400 }
      );
    }

    // Catch duplicates before the student wastes bandwidth uploading a file.
    try {
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
    } catch (dbErr) {
      console.error("[cloudinary-signature] duplicate check failed:", dbErr);
      return NextResponse.json(
        { error: "Could not verify existing submissions. Please try again." },
        { status: 500 }
      );
    }

    const signature = getUploadSignature(
      fileName,
      instructorKey,
      assignmentKey,
      studentId
    );

    return NextResponse.json({ success: true, signature }, { status: 200 });
  } catch (err) {
    console.error("[cloudinary-signature] error:", err);
    return NextResponse.json(
      { error: "Failed to prepare upload. Please try again." },
      { status: 500 }
    );
  }
}
