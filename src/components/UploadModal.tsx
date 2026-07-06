"use client";

import { useRef, useState, useCallback } from "react";
import {
  X,
  Upload,
  FileArchive,
  AlertCircle,
  Loader2,
  CheckCircle,
  Cloud,
  Database,
} from "lucide-react";
import { AssignmentConfig } from "@/lib/config";
import { InstructorKey } from "@/generated/prisma/client";

interface Props {
  assignment:     AssignmentConfig;
  instructorKey:  InstructorKey;
  instructorName: string;
  onClose:        () => void;
  onSuccess:      () => void;
}

interface FormState {
  studentId:  string;
  batch:      string;
  firstName:  string;
  lastName:   string;
  phone:      string;
  file:       File | null;
}

const INITIAL: FormState = {
  studentId: "",
  batch:     "",
  firstName: "",
  lastName:  "",
  phone:     "",
  file:      null,
};

type UploadPhase =
  | "idle"
  | "signing"      // fetching Cloudinary signature
  | "uploading"    // uploading file to Cloudinary
  | "submitting"   // saving metadata to our DB
  | "success"      // done
  | "error";

interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey:    string;
  cloudName: string;
  folder:    string;
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

export function UploadModal({
  assignment,
  instructorKey,
  instructorName,
  onClose,
  onSuccess,
}: Props) {
  const [form,      setForm]      = useState<FormState>(INITIAL);
  const [error,     setError]     = useState<string | null>(null);
  const [phase,     setPhase]     = useState<UploadPhase>("idle");
  const [progress,  setProgress]  = useState(0);
  const [dragOver,  setDragOver]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on backdrop click
  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // Keyboard close
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function handleFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Only .zip files are accepted.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File must be under 50 MB.");
      return;
    }
    setField("file", file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0] ?? null;
    handleFile(file);
  }

  async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(text || `Server returned status ${res.status}.`);
    }
  }

  async function getSignature(file: File): Promise<CloudinarySignature> {
    const params = new URLSearchParams({
      studentId:     form.studentId,
      instructorKey,
      assignmentKey: assignment.key,
      fileName:      file.name,
    });

    const res = await fetch(`/api/cloudinary-signature?${params.toString()}`);
    const data = await parseJsonResponse(res);

    if (!res.ok || !data.signature) {
      throw new Error((data.error as string) || "Could not prepare upload.");
    }

    return data.signature as CloudinarySignature;
  }

  function uploadToCloudinary(
    file: File,
    signature: CloudinarySignature
  ): Promise<{ secure_url: string; public_id: string }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100);
          setProgress(pct);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            if (result.secure_url && result.public_id) {
              resolve({
                secure_url: result.secure_url,
                public_id:  result.public_id,
              });
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
            // keep default message
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
      body.append("api_key",       signature.apiKey);
      body.append("timestamp",     String(signature.timestamp));
      body.append("signature",     signature.signature);
      body.append("resource_type", "raw");
      body.append("folder",        signature.folder);
      body.append("public_id",     file.name.replace(/\.zip$/i, ""));
      body.append("use_filename",  "true");
      body.append("unique_filename", "true");

      xhr.send(body);
    });
  }

  async function saveSubmission(
    file:       File,
    cloudinary: { secure_url: string; public_id: string }
  ): Promise<void> {
    const body = new FormData();
    body.append("studentId",     form.studentId);
    body.append("batch",         form.batch);
    body.append("firstName",     form.firstName.trim());
    body.append("lastName",      form.lastName.trim());
    body.append("phone",         form.phone.trim());
    body.append("instructorKey", instructorKey);
    body.append("assignmentKey", assignment.key);
    body.append("zipUrl",        cloudinary.secure_url);
    body.append("filePublicId",  cloudinary.public_id);
    body.append("fileName",      file.name);

    const res = await fetch("/api/submit", {
      method: "POST",
      body,
    });

    const data = await parseJsonResponse(res);

    if (!res.ok) {
      throw new Error((data.error as string) || "Submission failed. Please try again.");
    }
  }

  async function handleSubmit() {
    setError(null);
    setProgress(0);

    // --- Validation ---
    if (!form.studentId || form.studentId.length < 3) {
      setError("Student ID must be at least 3 characters.");
      return;
    }
    if (!form.batch || form.batch.length < 3) {
      setError("Batch is required (min 3 characters).");
      return;
    }
    if (!form.firstName.trim()) {
      setError("First name is required.");
      return;
    }
    if (!form.lastName.trim()) {
      setError("Last name is required.");
      return;
    }
    const phone = form.phone.trim();
    if (!phone) {
      setError("Phone number is required.");
      return;
    }
    if (!/^\+?[\d\s\-()]{7,15}$/.test(phone)) {
      setError("Please enter a valid phone number.");
      return;
    }
    if (!form.file) {
      setError("Please select your .zip file.");
      return;
    }

    setPhase("signing");

    try {
      // 1. Get signed upload params from our server
      const signature = await getSignature(form.file);

      // 2. Upload directly to Cloudinary (bypasses our server body limits)
      setPhase("uploading");
      const cloudinary = await uploadToCloudinary(form.file, signature);

      // 3. Save metadata in our database
      setPhase("submitting");
      await saveSubmission(form.file, cloudinary);

      // 4. Done
      setPhase("success");
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("[UploadModal] submit error:", err);
      setError(message);
      setPhase("error");
    }
  }

  const isBusy = phase === "signing" || phase === "uploading" || phase === "submitting";

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={`Upload ${assignment.label}`}
      tabIndex={-1}
    >
      <div className="modal-panel">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-icon">
              <FileArchive size={20} />
            </div>
            <div>
              <p className="modal-eyebrow">
                Assignment {assignment.number} &mdash; {instructorName}
              </p>
              <h2 className="modal-title">{assignment.label}</h2>
            </div>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
            disabled={isBusy}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {phase === "success" ? (
            <div className="upload-success" role="status">
              <div className="success-icon">
                <CheckCircle size={48} />
              </div>
              <h3 className="success-title">Submitted successfully!</h3>
              <p className="success-message">
                Your <strong>{assignment.label}</strong> file has been uploaded and recorded.
                You can close this window.
              </p>
            </div>
          ) : (
            <>
              {/* Row 1: Student ID + Batch */}
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
                    value={form.studentId}
                    onChange={(e) =>
                      setField("studentId", sanitizeId(e.target.value, 6))
                    }
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
                    value={form.batch}
                    onChange={(e) =>
                      setField("batch", sanitizeId(e.target.value, 10))
                    }
                    autoComplete="off"
                    disabled={isBusy}
                  />
                  <span className="field-hint">Up to 10 chars</span>
                </div>
              </div>

              {/* Row 2: First + Last name */}
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
                    value={form.firstName}
                    onChange={(e) => setField("firstName", e.target.value)}
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
                    value={form.lastName}
                    onChange={(e) => setField("lastName", e.target.value)}
                    disabled={isBusy}
                  />
                </div>
              </div>

              {/* Row 3: Phone (required) */}
              <div className="form-field">
                <label className="field-label" htmlFor="phone">
                  Phone Number <span className="field-required">*</span>{" "}
                  <span className="field-note">
                    (In case your file is corrupted, your upload fails, or the AI pipeline fails to read your data)
                  </span>
                </label>
                <input
                  id="phone"
                  className="field-input"
                  type="tel"
                  placeholder="+251 91 234 5678"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  disabled={isBusy}
                />
              </div>

              {/* File drop zone */}
              <div
                className={`drop-zone ${dragOver ? "drop-zone--active" : ""} ${form.file ? "drop-zone--filled" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
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
                {form.file ? (
                  <div className="drop-filled">
                    <FileArchive size={24} className="drop-file-icon" />
                    <div>
                      <p className="drop-filename">{form.file.name}</p>
                      <p className="drop-filesize">
                        {formatBytes(form.file.size)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="drop-empty">
                    <Upload size={28} className="drop-upload-icon" />
                    <p className="drop-main">
                      Drag & drop your <code>.zip</code> here
                    </p>
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
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {(phase === "signing" || phase === "submitting") && (
                <div className="upload-progress" aria-live="polite">
                  <div className="progress-row">
                    {phase === "signing" ? <Cloud size={16} /> : <Database size={16} />}
                    <span>
                      {phase === "signing"
                        ? "Preparing upload…"
                        : "Saving your submission…"}
                    </span>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="form-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn-ghost"
            onClick={onClose}
            disabled={isBusy}
          >
            {phase === "success" ? "Close" : "Cancel"}
          </button>
          {phase !== "success" && (
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={isBusy || !form.file}
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
                  Submit Assignment
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
