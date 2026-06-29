// lib/auth.ts
import { cookies } from "next/headers";

const COOKIE_NAME = "admin_auth";

export function isAuthenticated() {
  const cookieStore = cookies();
  return cookieStore.get(COOKIE_NAME)?.value === "true";
}

export function setAuthCookie() {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, "true", {
    httpOnly: true,
    path: "/",
  });
}

export function clearAuthCookie() {
  const cookieStore = cookies();
  cookieStore.delete(COOKIE_NAME);
}