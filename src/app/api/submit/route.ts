import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
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

// Assignment → allowed instructor mapping (prevents cross-submissions)
const ASSIGNMENT_INSTRUCTOR_MAP: Record<AssignmentKey, InstructorKey[]> = {
  A1_HTML_CSS:    ["KIBROM", "ZELALEM"],
  A2_JS:          ["ZELALEM"],
  A2_BOOTSTRAP:   ["KIBROM"],
  A3_WEB_PROJECT: ["KIBROM", "ZELALEM"],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function sanitizeUpperAlnum(value: string, maxLen: number): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, maxLen);
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

interface SubmissionInput {
  studentId:     string;
  batch:         string;
  firstName:     string;
  lastName:      string;
  phone:         string;
  instructorKey: InstructorKey;
  assignmentKey: AssignmentKey;
  zipUrl:        string;
  filePublicId:  string;
  fileName:      string;
  ipAddress:     string | null;
}

/**
 * Validates the submission form fields. Returns a 400 response if anything
 * is invalid, otherwise returns the validated payload.
 */
function validateFields(formData: FormData):
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      fields: Omit<SubmissionInput, "zipUrl" | "filePublicId" | "fileName" | "ipAddress">;
    } {
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
    return { ok: false, response: NextResponse.json({ error: "Invalid student ID." }, { status: 400 }) };
  }
  if (!batch || batch.length < 3) {
    return { ok: false, response: NextResponse.json({ error: "Invalid batch." }, { status: 400 }) };
  }
  if (!firstName || !lastName) {
    return { ok: false, response: NextResponse.json({ error: "First and last name are required." }, { status: 400 }) };
  }
  if (!phone) {
    return { ok: false, response: NextResponse.json({ error: "Phone number is required." }, { status: 400 }) };
  }
  if (!/^\+?[\d\s\-()]{7,15}$/.test(phone)) {
    return { ok: false, response: NextResponse.json({ error: "Invalid phone number." }, { status: 400 }) };
  }
  if (!rawInstructor || !VALID_INSTRUCTOR_KEYS.has(rawInstructor as InstructorKey)) {
    return { ok: false, response: NextResponse.json({ error: "Invalid instructor." }, { status: 400 }) };
  }
  if (!rawAssignment || !VALID_ASSIGNMENT_KEYS.has(rawAssignment as AssignmentKey)) {
    return { ok: false, response: NextResponse.json({ error: "Invalid assignment." }, { status: 400 }) };
  }

  const instructorKey = rawInstructor as InstructorKey;
  const assignmentKey = rawAssignment as AssignmentKey;

  if (!ASSIGNMENT_INSTRUCTOR_MAP[assignmentKey].includes(instructorKey)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This assignment is not available for the selected instructor." },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true,
    fields: {
      studentId,
      batch,
      firstName,
      lastName,
      phone,
      instructorKey,
      assignmentKey,
    },
  };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
  console.log(`[submit:${requestId}] started`);

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
      console.log(`[submit:${requestId}] formData parsed`);
    } catch (parseErr) {
      console.error(`[submit:${requestId}] formData parse error:`, parseErr);
      return NextResponse.json(
        { error: "Could not read the submitted form. Make sure the file is under 50 MB and try again." },
        { status: 400 }
      );
    }

    const validation = validateFields(formData);
    if (!validation.ok) {
      console.log(`[submit:${requestId}] validation failed`);
      return validation.response;
    }

    const fields = validation.fields;
    console.log(`[submit:${requestId}] validated studentId=${fields.studentId} assignment=${fields.assignmentKey} instructor=${fields.instructorKey}`);

    // --- Check duplicate submission ---
    try {
      const existing = await prisma.submission.findUnique({
        where: {
          studentId_instructorKey_assignmentKey: {
            studentId:     fields.studentId,
            instructorKey: fields.instructorKey,
            assignmentKey: fields.assignmentKey,
          },
        },
      });
      if (existing) {
        console.log(`[submit:${requestId}] duplicate submission`);
        return NextResponse.json(
          {
            error:
              "You have already submitted this assignment. Contact your instructor if you need to resubmit.",
          },
          { status: 409 }
        );
      }
    } catch (dbErr) {
      console.error(`[submit:${requestId}] duplicate check failed:`, dbErr);
      return NextResponse.json(
        { error: "Could not verify existing submissions. Please try again." },
        { status: 500 }
      );
    }

    // --- Resolve Cloudinary asset ---
    // Preferred: client uploaded directly and sent us the resulting URL + public_id.
    // Fallback: server-side upload for backward compatibility / direct page tests.
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
      console.log(`[submit:${requestId}] using direct upload publicId=${filePublicId}`);
    } else if (file) {
      console.log(`[submit:${requestId}] server-side upload file=${file.name} size=${file.size}`);

      if (!file.name.toLowerCase().endsWith(".zip")) {
        return NextResponse.json({ error: "Only .zip files are accepted." }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File must be under 50 MB." }, { status: 400 });
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await uploadZip(
          buffer,
          file.name,
          fields.instructorKey,
          fields.assignmentKey,
          fields.studentId
        );
        zipUrl       = result.secure_url;
        filePublicId = result.public_id;
        fileName     = file.name;
        console.log(`[submit:${requestId}] server-side upload complete publicId=${filePublicId}`);
      } catch (uploadErr) {
        console.error(`[submit:${requestId}] cloudinary upload error:`, uploadErr);
        const message = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        return NextResponse.json(
          { error: `Upload to cloud storage failed: ${message}` },
          { status: 502 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "No file uploaded." },
        { status: 400 }
      );
    }

    // --- Get IP address ---
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // --- Write to DB ---
    try {
      await prisma.submission.create({
        data: {
          ...fields,
          zipUrl,
          filePublicId,
          fileName,
          ipAddress,
          isResubmit: false,
        },
      });
      console.log(`[submit:${requestId}] db record created`);
    } catch (dbErr) {
      console.error(`[submit:${requestId}] db write error:`, dbErr);

      // If the DB write fails, attempt to remove the orphaned Cloudinary asset.
      void deleteAsset(filePublicId);

      if (isPrismaUniqueViolation(dbErr)) {
        return NextResponse.json(
          {
            error:
              "You have already submitted this assignment. Contact your instructor if you need to resubmit.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "We saved your file but could not record the submission. Please contact your instructor." },
        { status: 500 }
      );
    }

    console.log(`[submit:${requestId}] success`);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error(`[submit:${requestId}] unexpected error:`, err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
