import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const submissions = await prisma.submission.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id:            true,
        studentId:     true,
        firstName:     true,
        lastName:      true,
        batch:         true,
        phone:         true,
        instructorKey: true,
        assignmentKey: true,
        fileName:      true,
        zipUrl:        true,
        ipAddress:     true,
        createdAt:     true,
      },
    });

    return NextResponse.json({ submissions });
  } catch (err) {
    console.error("[dashboard/submissions] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch submissions." },
      { status: 500 }
    );
  }
}