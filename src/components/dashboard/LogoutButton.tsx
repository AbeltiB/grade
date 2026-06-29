"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/dashboard/login");
  }

  return (
    <button
      className="logout-btn"
      onClick={handleLogout}
      disabled={loading}
      aria-label="Log out"
    >
      {loading ? <Loader2 size={15} className="spin" /> : <LogOut size={15} />}
      Log out
    </button>
  );
}