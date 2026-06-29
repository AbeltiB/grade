import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required." },
        { status: 400 }
      );
    }

    // Support either DASHBOARD_PASSWORD or the legacy ADMIN_PASSWORD env var.
    const dashboardPassword =
      process.env.DASHBOARD_PASSWORD || process.env.ADMIN_PASSWORD;
    if (!dashboardPassword) {
      console.error("[auth/login] No dashboard password env var set.");
      return NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      );
    }

    // Timing-safe comparison to prevent timing attacks
    const encoder = new TextEncoder();
    const a = encoder.encode(password);
    const b = encoder.encode(dashboardPassword);

    // Use crypto.subtle for timing-safe comparison
    const isValid =
      a.length === b.length &&
      (await crypto.subtle
        .importKey("raw", b, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
        .then((key) =>
          Promise.all([
            crypto.subtle.sign("HMAC", key, a),
            crypto.subtle.sign("HMAC", key, b),
          ])
        )
        .then(([sigA, sigB]) => {
          const va = new Uint8Array(sigA);
          const vb = new Uint8Array(sigB);
          return va.every((byte, i) => byte === vb[i]);
        }));

    if (!isValid) {
      // Consistent delay to prevent timing inference
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json(
        { error: "Incorrect password." },
        { status: 401 }
      );
    }

    const session = await getSession();
    session.isAuthenticated = true;
    await session.save();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/login] error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
