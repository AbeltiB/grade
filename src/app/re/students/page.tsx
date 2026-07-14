"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Upload,
  FileArchive,
  AlertCircle,
  Loader2,
  CheckCircle,
  Cloud,
  Database,
  GraduationCap,
  Lock,
} from "lucide-react";
import { INSTRUCTORS, ASSIGNMENTS_BY_INSTRUCTOR } from "@/lib/config";
import { InstructorKey, AssignmentKey } from "@/generated/prisma/client";

type UploadPhase =
  | "idle"
  | "signing"
  | "uploading"
  | "submitting"
  | "success"
  | "error";

interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey:    string;
  cloudName: string;
  folder:    string;
  publicId:  string;
}

function sanitizeId(value: string, maxLen: number): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, maxLen);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `Server returned status ${res.status}.`);
  }
}

function ResubmitForm() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";

  const [authorized, setAuthorized] = useState(false);
  const [checkingCode, setCheckingCode] = useState(true);
  const [codeInput, setCodeInput] = useState(code);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [studentId,    setStudentId]    = useState("");
  const [batch,        setBatch]        = useState("");
  const [firstName,    setFirstName]    = useState("");
  const [lastName,     setLastName]     = useState("");
  const [phone,        setPhone]        = useState("");
  const [instructorKey, setInstructorKey] = useState<InstructorKey>("KIBROM");
  const [assignmentKey, setAssignmentKey] = useState<AssignmentKey>("A1_HTML_CSS");
  const [file,         setFile]         = useState<File | null>(null);

  const [error,   setError]   = useState<string | null>(null);
  const [phase,   setPhase]   = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate the resubmission code on mount (when provided via query string).
  useEffect(() => {
    async function checkCode(value: string) {
      if (!value.trim()) {
        setAuthorized(false);
        setCheckingCode(false);
        return;
      }
      try {
        const res = await fetch(`/api/resubmit-code?code=${encodeURIComponent(value)}`);
        setAuthorized(res.ok);
        if (!res.ok) setCodeError("Invalid resubmission code.");
      } catch {
        setAuthorized(false);
        setCodeError("Could not verify the code. Please try again.");
      } finally {
        setCheckingCode(false);
      }
    }
    checkCode(code);
  }, [code]);

  const availableAssignments = ASSIGNMENTS_BY_INSTRUCTOR[instructorKey];

  function handleInstructorChange(key: InstructorKey) {
    setInstructorKey(key);
    const assignments = ASSIGNMENTS_BY_INSTRUCTOR[key];
    if (!assignments.some((a) => a.key === assignmentKey)) {
      setAssignmentKey(assignments[0].key);
    }
  }

  function handleFile(selected: File | null) {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".zip")) {
      setError("Only .zip files are accepted.");
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      setError("File must be under 50 MB.");
      return;
    }
    setFile(selected);
    setError(null);
  }

  async function handleVerifyCode(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setCodeError("Please enter the resubmission code.");
      return;
    }
    setCheckingCode(true);
    setCodeError(null);
    try {
      const res = await fetch(`/api/resubmit-code?code=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        setAuthorized(true);
      } else {
        setCodeError("Invalid resubmission code.");
      }
    } catch {
      setCodeError("Could not verify the code. Please try again.");
    } finally {
      setCheckingCode(false);
    }
  }

  async function getSignature(): Promise<CloudinarySignature> {
    if (!file) throw new Error("No file selected.");
    const params = new URLSearchParams({
      studentId,
      instructorKey,
      assignmentKey,
      fileName: file.name,
    });

    const res = await fetch(`/api/cloudinary-signature?${params.toString()}`);
    const data = await parseJsonResponse(res);

    if (!res.ok || !data.signature) {
      throw new Error((data.error as string) || "Could not prepare upload.");
    }

    return data.signature as CloudinarySignature;
  }

  function uploadToCloudinary(
    signature: CloudinarySignature
  ): Promise<{ secure_url: string; public_id: string }> {
    if (!file) throw new Error("No file selected.");

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          setProgress(Math.round((event.loaded / event.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            if (result.secure_url && result.public_id) {
              resolve({ secure_url: result.secure_url, public_id: result.public_id });
            } else {
              reject(new Error("Cloudinary response missing file info."));
            }
          } catch {
            reject(new Error("Invalid response from cloud storage."));
          }
        } else {
          let message = `Cloudinary upload failed (${xhr.status}).`;
          try {
            const err = JSON.parse(xhr.responseText);
            message = (err.error?.message as string) || message;
          } catch {
            // keep default
          }
          reject(new Error(message));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error while uploading to cloud storage."));
      });
      xhr.addEventListener("abort", () => {
        reject(new Error("Upload was cancelled."));
      });

      const url = `https://api.cloudinary.com/v1_1/${signature.cloudName}/raw/upload`;
      xhr.open("POST", url);

      const body = new FormData();
      body.append("file", file);
      body.append("api_key", signature.apiKey);
      body.append("timestamp", String(signature.timestamp));
      body.append("signature", signature.signature);
      body.append("resource_type", "raw");
      body.append("folder", signature.folder);
      body.append("public_id", signature.publicId);
      body.append("use_filename", "true");
      body.append("unique_filename", "true");

      xhr.send(body);
    });
  }

  async function saveResubmission(
    cloudinary: { secure_url: string; public_id: string }
  ): Promise<void> {
    if (!file) throw new Error("No file selected.");

    const body = new FormData();
    body.append("code", code);
    body.append("studentId", studentId);
    body.append("batch", batch);
    body.append("firstName", firstName.trim());
    body.append("lastName", lastName.trim());
    body.append("phone", phone.trim());
    body.append("instructorKey", instructorKey);
    body.append("assignmentKey", assignmentKey);
    body.append("zipUrl", cloudinary.secure_url);
    body.append("filePublicId", cloudinary.public_id);
    body.append("fileName", file.name);

    const res = await fetch("/api/resubmit", {
      method: "POST",
      body,
    });

    const data = await parseJsonResponse(res);
    if (!res.ok) {
      throw new Error((data.error as string) || "Resubmission failed. Please try again.");
    }
  }

  async function handleSubmit() {
    setError(null);
    setProgress(0);

    if (!studentId || studentId.length < 3) {
      setError("Student ID must be at least 3 characters.");
      return;
    }
    if (!batch || batch.length < 3) {
      setError("Batch is required (min 3 characters).");
      return;
    }
    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }
    if (!lastName.trim()) {
      setError("Last name is required.");
      return;
    }
    const phoneClean = phone.trim();
    if (!phoneClean) {
      setError("Phone number is required.");
      return;
    }
    if (!/^\+?[\d\s\-()]{7,15}$/.test(phoneClean)) {
      setError("Please enter a valid phone number.");
      return;
    }
    if (!file) {
      setError("Please select your .zip file.");
      return;
    }

    setPhase("signing");

    try {
      const signature = await getSignature();
      setPhase("uploading");
      const cloudinary = await uploadToCloudinary(signature);
      setPhase("submitting");
      await saveResubmission(cloudinary);
      setPhase("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("[ResubmitPage] error:", err);
      setError(message);
      setPhase("error");
    }
  }

  const isBusy = phase === "signing" || phase === "uploading" || phase === "submitting";

  if (checkingCode) {
    return (
      <main className="portal-root">
        <div className="portal-container" style={{ textAlign: "center", paddingTop: "80px" }}>
          <Loader2 size={32} className="spin" />
          <p className="hero-sub" style={{ marginTop: "16px" }}>Checking access…</p>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="portal-root">
        <div className="bg-blob bg-blob--1" aria-hidden="true" />
        <div className="bg-blob bg-blob--2" aria-hidden="true" />

        <div className="portal-container" style={{ maxWidth: "480px" }}>
          <div className="hero-icon-wrap">
            <GraduationCap size={36} strokeWidth={1.5} />
          </div>
          <h1 className="hero-heading">Student Resubmission</h1>
          <p className="hero-sub">
            Enter the resubmission code shared by your instructor to continue.
          </p>

          <div className="modal-panel" style={{ marginTop: "32px", padding: "28px" }}>
            <div className="form-field">
              <label className="field-label" htmlFor="resubmit-code">
                Resubmission Code <span className="field-required">*</span>
              </label>
              <input
                id="resubmit-code"
                className="field-input"
                type="text"
                placeholder="Enter code"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setCodeError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleVerifyCode(codeInput);
                }}
                disabled={checkingCode}
                autoComplete="off"
              />
            </div>

            {codeError && (
              <div className="form-error" role="alert" style={{ marginTop: "14px" }}>
                <AlertCircle size={16} />
                <span>{codeError}</span>
              </div>
            )}

            <button
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: "18px" }}
              onClick={() => handleVerifyCode(codeInput)}
              disabled={checkingCode || !codeInput.trim()}
            >
              {checkingCode ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <Lock size={16} />
                  Verify Code
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="portal-root">
      <div className="bg-blob bg-blob--1" aria-hidden="true" />
      <div className="bg-blob bg-blob--2" aria-hidden="true" />

      <div className="portal-container" style={{ maxWidth: "720px" }}>
        <div className="hero-icon-wrap">
          <GraduationCap size={36} strokeWidth={1.5} />
        </div>
        <h1 className="hero-heading">Student Resubmission</h1>
        <p className="hero-sub">
          Use this page only if your instructor shared this link with you.
          This will replace any previous submission for the selected assignment.
        </p>

        <div className="modal-panel" style={{ marginTop: "32px" }}>
          {phase === "success" ? (
            <div className="upload-success" role="status">
              <div className="success-icon">
                <CheckCircle size={48} />
              </div>
              <h3 className="success-title">Resubmitted successfully!</h3>
              <p className="success-message">
                Your new file has been uploaded and your previous submission has been replaced.
              </p>
            </div>
          ) : (
            <div className="modal-body" style={{ gap: "18px" }}>
              {/* Instructor + Assignment */}
              <div className="form-row">
                <div className="form-field">
                  <label className="field-label" htmlFor="instructorKey">
                    Instructor <span className="field-required">*</span>
                  </label>
                  <select
                    id="instructorKey"
                    className="field-input"
                    value={instructorKey}
                    onChange={(e) => handleInstructorChange(e.target.value as InstructorKey)}
                    disabled={isBusy}
                  >
                    {INSTRUCTORS.map((i) => (
                      <option key={i.key} value={i.key}>{i.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label className="field-label" htmlFor="assignmentKey">
                    Assignment <span className="field-required">*</span>
                  </label>
                  <select
                    id="assignmentKey"
                    className="field-input"
                    value={assignmentKey}
                    onChange={(e) => setAssignmentKey(e.target.value as AssignmentKey)}
                    disabled={isBusy}
                  >
                    {availableAssignments.map((a) => (
                      <option key={a.key} value={a.key}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Student ID + Batch */}
              <div className="form-row">
                <div className="form-field">
                  <label className="field-label" htmlFor="studentId">
                    Student ID <span className="field-required">*</span>
                  </label>
                  <input
                    id="studentId"
                    className="field-input"
                    type="text"
                    placeholder="JD0006"
                    maxLength={6}
                    value={studentId}
                    onChange={(e) => setStudentId(sanitizeId(e.target.value, 6))}
                    autoComplete="off"
                    disabled={isBusy}
                  />
                  <span className="field-hint">6-char alphanumeric</span>
                </div>

                <div className="form-field">
                  <label className="field-label" htmlFor="batch">
                    Batch <span className="field-required">*</span>
                  </label>
                  <input
                    id="batch"
                    className="field-input"
                    type="text"
                    placeholder="DRBSE2502"
                    maxLength={10}
                    value={batch}
                    onChange={(e) => setBatch(sanitizeId(e.target.value, 10))}
                    autoComplete="off"
                    disabled={isBusy}
                  />
                  <span className="field-hint">Up to 10 chars</span>
                </div>
              </div>

              {/* Names */}
              <div className="form-row">
                <div className="form-field">
                  <label className="field-label" htmlFor="firstName">
                    First Name <span className="field-required">*</span>
                  </label>
                  <input
                    id="firstName"
                    className="field-input"
                    type="text"
                    placeholder="Abebe"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isBusy}
                  />
                </div>

                <div className="form-field">
                  <label className="field-label" htmlFor="lastName">
                    Last Name <span className="field-required">*</span>
                  </label>
                  <input
                    id="lastName"
                    className="field-input"
                    type="text"
                    placeholder="Kebede"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isBusy}
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="form-field">
                <label className="field-label" htmlFor="phone">
                  Phone Number <span className="field-required">*</span>
                </label>
                <input
                  id="phone"
                  className="field-input"
                  type="tel"
                  placeholder="+251 91 234 5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isBusy}
                />
              </div>

              {/* File drop zone */}
              <div
                className={`drop-zone ${dragOver ? "drop-zone--active" : ""} ${file ? "drop-zone--filled" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files[0] ?? null);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Click or drag to upload zip file"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  disabled={isBusy}
                />
                {file ? (
                  <div className="drop-filled">
                    <FileArchive size={24} className="drop-file-icon" />
                    <div>
                      <p className="drop-filename">{file.name}</p>
                      <p className="drop-filesize">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="drop-empty">
                    <Upload size={28} className="drop-upload-icon" />
                    <p className="drop-main">Drag & drop your <code>.zip</code> here</p>
                    <p className="drop-sub">or click to browse — max 50 MB</p>
                  </div>
                )}
              </div>

              {/* Progress */}
              {phase === "uploading" && (
                <div className="upload-progress" aria-live="polite">
                  <div className="progress-row">
                    <Cloud size={16} />
                    <span>Uploading to cloud storage… {progress}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {(phase === "signing" || phase === "submitting") && (
                <div className="upload-progress" aria-live="polite">
                  <div className="progress-row">
                    {phase === "signing" ? <Cloud size={16} /> : <Database size={16} />}
                    <span>{phase === "signing" ? "Preparing upload…" : "Saving your resubmission…"}</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="form-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {phase !== "success" && (
            <div className="modal-footer">
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={isBusy || !file}
              >
                {isBusy ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    {phase === "signing" && "Preparing…"}
                    {phase === "uploading" && `Uploading ${progress}%`}
                    {phase === "submitting" && "Saving…"}
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Resubmit Assignment
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ResubmitPage() {
  return (
    <Suspense
      fallback={
        <main className="portal-root">
          <div className="portal-container" style={{ textAlign: "center", paddingTop: "80px" }}>
            <Loader2 size={32} className="spin" />
            <p className="hero-sub" style={{ marginTop: "16px" }}>Loading…</p>
          </div>
        </main>
      }
    >
      <ResubmitForm />
    </Suspense>
  );
}
