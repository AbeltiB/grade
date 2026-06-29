import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File;
    const studentId = formData.get("studentId") as string;
    const fullName = formData.get("fullName") as string;
    const phone = formData.get("phone") as string | null;
    const instructor = formData.get("instructor") as string;
    const assignment = Number(formData.get("assignment"));

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload ZIP to Cloudinary (raw file)
    const uploadResult = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          folder: "assignments",
        },
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      ).end(buffer);
    });

    const submission = await prisma.submission.create({
      data: {
        studentId,
        fullName,
        phone: phone || null,
        instructor,
        assignment,
        zipUrl: uploadResult.secure_url,
      },
    });

    return NextResponse.json({
      success: true,
      submission,
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}