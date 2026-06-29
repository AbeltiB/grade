"use client";

import { useRef, useState, useCallback } from "react";
import { X, Upload, FileArchive, AlertCircle, Loader2 } from "lucide-react";
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

function sanitizeId(value: string, maxLen: number): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, maxLen);
}

export function UploadModal({
  assignment,
  instructorKey,
  instructorName,
  onClose,
  onSuccess,
}: Props) {
  const [form,    setForm]    = useState<FormState>(INITIAL);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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

  async function handleSubmit() {
    setError(null);

    // Validation
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
    if (!form.file) {
      setError("Please select your .zip file.");
      return;
    }
    if (form.phone && !/^\+?[\d\s\-()]{7,15}$/.test(form.phone)) {
      setError("Please enter a valid phone number.");
      return;
    }

    setLoading(true);

    try {
      const body = new FormData();
      body.append("studentId",    form.studentId);
      body.append("batch",        form.batch);
      body.append("firstName",    form.firstName.trim());
      body.append("lastName",     form.lastName.trim());
      body.append("phone",        form.phone.trim());
      body.append("instructorKey", instructorKey);
      body.append("assignmentKey", assignment.key);
      body.append("file",         form.file);

      const res = await fetch("/api/submit", {
        method: "POST",
        body,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Submission failed. Please try again.");
        return;
      }

      onSuccess();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

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
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
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
                disabled={loading}
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
                disabled={loading}
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
                disabled={loading}
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
                disabled={loading}
              />
            </div>
          </div>

          {/* Row 3: Phone (optional) */}
          <div className="form-field">
            <label className="field-label" htmlFor="phone">
              Phone Number{" "}
              <span className="field-optional">(optional)</span>
            </label>
            <input
              id="phone"
              className="field-input"
              type="tel"
              placeholder="+251 91 234 5678"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              disabled={loading}
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
              disabled={loading}
            />
            {form.file ? (
              <div className="drop-filled">
                <FileArchive size={24} className="drop-file-icon" />
                <div>
                  <p className="drop-filename">{form.file.name}</p>
                  <p className="drop-filesize">
                    {(form.file.size / 1024 / 1024).toFixed(2)} MB
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

          {/* Error */}
          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn-ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading || !form.file}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload size={16} />
                Submit Assignment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}