import { NextRequest, NextResponse } from "next/server";

const RESUBMIT_CODE = process.env.RESUBMIT_CODE;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.trim();

  if (!RESUBMIT_CODE || code !== RESUBMIT_CODE) {
    return NextResponse.json({ valid: false }, { status: 403 });
  }

  return NextResponse.json({ valid: true });
}
