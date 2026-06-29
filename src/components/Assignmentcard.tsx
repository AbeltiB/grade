"use client";

import { useState } from "react";
import { Upload, CheckCircle } from "lucide-react";
import { AssignmentConfig } from "@/lib/config";
import { InstructorKey } from "@/generated/prisma/client";
import { UploadModal } from "./UploadModal";

interface Props {
  assignment:     AssignmentConfig;
  instructorKey:  InstructorKey;
  instructorName: string;
}

export function AssignmentCard({ assignment, instructorKey, instructorName }: Props) {
  const [modalOpen,  setModalOpen]  = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  return (
    <>
      <div className={`assignment-card ${submitted ? "assignment-card--done" : ""}`}>
        {/* Number badge */}
        <div className="asn-number-badge">
          <span>{assignment.number}</span>
        </div>

        <div className="asn-body">
          <h2 className="asn-label">{assignment.label}</h2>
          <p className="asn-description">{assignment.description}</p>
        </div>

        {submitted ? (
          <div className="asn-submitted-state">
            <CheckCircle size={18} />
            <span>Submitted successfully</span>
          </div>
        ) : (
          <button
            className="asn-upload-btn"
            onClick={() => setModalOpen(true)}
            aria-label={`Upload ${assignment.label}`}
          >
            <Upload size={16} />
            Upload Assignment
          </button>
        )}
      </div>

      {modalOpen && (
        <UploadModal
          assignment={assignment}
          instructorKey={instructorKey}
          instructorName={instructorName}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setSubmitted(true);
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}