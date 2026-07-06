import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadZip, deleteAsset } from "@/lib/cloudinary";
import { AssignmentKey, InstructorKey } from "@/generated/prisma/client";

const VALID_INSTRUCTOR_KEYS = new Set<InstructorKey>(["KIBROM", "ZELALEM"]);
const VALID_ASSIGNMENT_KEYS = new Set<AssignmentKey>([
  "A1_HTML_CSS",
  "A2_JS",
  "A2_BOOTSTRAP",
  "A3_WEB_PROJECT",
]);

const ASSIGNMENT_INSTRUCTOR_MAP: Record<AssignmentKey, InstructorKey[]> = {
  A1_HTML_CSS:    ["KIBROM", "ZELALEM"],
  A2_JS:          ["ZELALEM"],
  A2_BOOTSTRAP:   ["KIBROM"],
  A3_WEB_PROJECT: ["KIBROM", "ZELALEM"],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const RESUBMIT_CODE = process.env.RESUBMIT_CODE;

function sanitizeUpperAlnum(value: string, maxLen: number): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, maxLen);
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
  console.log(`[resubmit:${requestId}] started`);

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (parseErr) {
      console.error(`[resubmit:${requestId}] formData parse error:`, parseErr);
      return NextResponse.json(
        { error: "Could not read the submitted form. Make sure the file is under 50 MB and try again." },
        { status: 400 }
      );
    }

    // --- Authorize resubmission ---
    const code = (formData.get("code") as string | null)?.trim();
    if (!RESUBMIT_CODE || code !== RESUBMIT_CODE) {
      console.log(`[resubmit:${requestId}] invalid resubmit code`);
      return NextResponse.json(
        { error: "Invalid or missing resubmission code." },
        { status: 403 }
      );
    }

    // --- Extract & validate fields ---
    const rawStudentId    = formData.get("studentId")    as string | null;
    const rawBatch        = formData.get("batch")        as string | null;
    const firstName       = (formData.get("firstName")   as string | null)?.trim();
    const lastName        = (formData.get("lastName")    as string | null)?.trim();
    const phone           = (formData.get("phone")       as string | null)?.trim() || null;
    const rawInstructor   = formData.get("instructorKey") as string | null;
    const rawAssignment   = formData.get("assignmentKey") as string | null;

    const studentId = rawStudentId ? sanitizeUpperAlnum(rawStudentId, 6)  : "";
    const batch     = rawBatch     ? sanitizeUpperAlnum(rawBatch,     10) : "";

    if (!studentId || studentId.length < 3) {
      return NextResponse.json({ error: "Invalid student ID." }, { status: 400 });
    }
    if (!batch || batch.length < 3) {
      return NextResponse.json({ error: "Invalid batch." }, { status: 400 });
    }
    if (!firstName || !lastName) {
      return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }
    if (!/^\+?[\d\s\-()]{7,15}$/.test(phone)) {
      return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
    }
    if (!rawInstructor || !VALID_INSTRUCTOR_KEYS.has(rawInstructor as InstructorKey)) {
      return NextResponse.json({ error: "Invalid instructor." }, { status: 400 });
    }
    if (!rawAssignment || !VALID_ASSIGNMENT_KEYS.has(rawAssignment as AssignmentKey)) {
      return NextResponse.json({ error: "Invalid assignment." }, { status: 400 });
    }

    const instructorKey = rawInstructor as InstructorKey;
    const assignmentKey = rawAssignment as AssignmentKey;

    if (!ASSIGNMENT_INSTRUCTOR_MAP[assignmentKey].includes(instructorKey)) {
      return NextResponse.json(
        { error: "This assignment is not available for the selected instructor." },
        { status: 400 }
      );
    }

    // --- Resolve Cloudinary asset ---
    let zipUrl:       string;
    let filePublicId: string;
    let fileName:     string;

    const directUrl       = formData.get("zipUrl")       as string | null;
    const directPublicId  = formData.get("filePublicId") as string | null;
    const directFileName  = formData.get("fileName")     as string | null;
    const file            = formData.get("file")         as File | null;

    if (directUrl && directPublicId && directFileName) {
      zipUrl       = directUrl;
      filePublicId = directPublicId;
      fileName     = directFileName;
      console.log(`[resubmit:${requestId}] using direct upload publicId=${filePublicId}`);
    } else if (file) {
      console.log(`[resubmit:${requestId}] server-side upload file=${file.name} size=${file.size}`);

      if (!file.name.toLowerCase().endsWith(".zip")) {
        return NextResponse.json({ error: "Only .zip files are accepted." }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File must be under 50 MB." }, { status: 400 });
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await uploadZip(buffer, file.name, instructorKey, assignmentKey, studentId);
        zipUrl       = result.secure_url;
        filePublicId = result.public_id;
        fileName     = file.name;
      } catch (uploadErr) {
        console.error(`[resubmit:${requestId}] cloudinary upload error:`, uploadErr);
        const message = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        return NextResponse.json(
          { error: `Upload to cloud storage failed: ${message}` },
          { status: 502 }
        );
      }
    } else {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // --- Upsert submission (resubmit) ---
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
        console.log(`[resubmit:${requestId}] updating existing submission ${existing.id}`);

        // Delete the old Cloudinary asset so we don't leave orphaned files.
        if (existing.filePublicId) {
          void deleteAsset(existing.filePublicId);
        }

        await prisma.submission.update({
          where: { id: existing.id },
          data: {
            batch,
            firstName,
            lastName,
            phone,
            zipUrl,
            filePublicId,
            fileName,
            ipAddress,
          },
        });
      } else {
        console.log(`[resubmit:${requestId}] creating new submission`);
        await prisma.submission.create({
          data: {
            studentId,
            batch,
            firstName,
            lastName,
            phone,
            instructorKey,
            assignmentKey,
            zipUrl,
            filePublicId,
            fileName,
            ipAddress,
          },
        });
      }
    } catch (dbErr) {
      console.error(`[resubmit:${requestId}] db write error:`, dbErr);
      void deleteAsset(filePublicId);
      return NextResponse.json(
        { error: "We saved your file but could not record the submission. Please contact your instructor." },
        { status: 500 }
      );
    }

    console.log(`[resubmit:${requestId}] success`);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error(`[resubmit:${requestId}] unexpected error:`, err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
