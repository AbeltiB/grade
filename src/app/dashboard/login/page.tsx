"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Loader2, AlertCircle, GraduationCap } from "lucide-react";

export default function LoginPage() {
  const router      = useRouter();
  const params      = useSearchParams();
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleLogin() {
    if (!password) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setPassword("");
        inputRef.current?.focus();
        return;
      }

      const from = params.get("from") ?? "/dashboard";
      router.replace(from);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-root">
      <div className="bg-blob bg-blob--1" aria-hidden="true" />
      <div className="bg-blob bg-blob--2" aria-hidden="true" />

      <div className="login-card">
        <div className="login-icon-wrap">
          <GraduationCap size={28} strokeWidth={1.5} />
        </div>

        <h1 className="login-heading">Instructor Dashboard</h1>
        <p className="login-sub">Enter your access password to continue.</p>

        <div className="login-field">
          <label className="field-label" htmlFor="password">
            <Lock size={13} />
            Access Password
          </label>
          <input
            ref={inputRef}
            id="password"
            className="field-input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
            disabled={loading}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <button
          className="btn-primary login-btn"
          onClick={handleLogin}
          disabled={loading || !password}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="spin" />
              Verifying…
            </>
          ) : (
            <>
              <Lock size={16} />
              Access Dashboard
            </>
          )}
        </button>
      </div>
    </main>
  );
}