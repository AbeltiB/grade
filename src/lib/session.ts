import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  isAuthenticated: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,   // min 32-char secret
  cookieName: "grade_dash_session",
  cookieOptions: {
    secure:   process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge:   60 * 60 * 8, // 8 hours
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireAuth(): Promise<void> {
  const session = await getSession();
  if (!session.isAuthenticated) {
    // Caller should redirect — we just throw so the route handler knows
    throw new Error("UNAUTHORIZED");
  }
}