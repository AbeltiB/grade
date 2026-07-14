import Link from "next/link";
import { GraduationCap, FileArchive, ChevronRight, Sparkles, RotateCcw } from "lucide-react";
import { INSTRUCTORS } from "@/lib/config";

export default function HomePage() {
  return (
    <main className="portal-root">
      <div className="bg-blob bg-blob--1" aria-hidden="true" />
      <div className="bg-blob bg-blob--2" aria-hidden="true" />
      <div className="bg-blob bg-blob--3" aria-hidden="true" />

      <Link
        href="/re/students"
        className="resubmit-corner-btn"
        aria-label="Resubmit assignment"
      >
        <RotateCcw size={16} />
        Resubmit
      </Link>

      <div className="portal-container">
        {/* Badge */}
        <div className="badge-row">
          <span className="badge">
            <Sparkles size={12} />
            Web Design I &mdash; Academic Year 2025–2026
          </span>
        </div>

        {/* Icon */}
        <div className="hero-icon-wrap">
          <GraduationCap size={36} strokeWidth={1.5} />
        </div>

        {/* Heading */}
        <h1 className="hero-heading">
          Assignment{" "}
          <span className="heading-accent">Submission</span>{" "}
          Portal
        </h1>

        <p className="hero-sub">
          Welcome. This is your official assignment submission portal.
          <br className="hero-br" />
          Choose your lecture instructor below to submit your work.
        </p>

        {/* Divider */}
        <div className="section-divider" aria-hidden="true">
          <span />
          <span className="divider-label">Choose Your Instructor</span>
          <span />
        </div>

        {/* Instructor Cards */}
        <div className="cards-grid">
          {INSTRUCTORS.map((instructor) => (
            <Link
              key={instructor.key}
              href={`/instructor/${instructor.slug}`}
              className="instructor-card"
              aria-label={`Submit assignments to ${instructor.name}`}
            >
              <div className="card-slash" aria-hidden="true" />

              <div className="card-avatar">
                <span className="card-initials">{instructor.initials}</span>
                <div className="avatar-ring" aria-hidden="true" />
              </div>

              <div className="card-body">
                <p className="card-dept-label">{instructor.department}</p>
                <h2 className="card-name">{instructor.name}</h2>
                <p className="card-role">{instructor.title}</p>
              </div>

              <div className="card-cta">
                <span className="cta-text">Submit assignments</span>
                <ChevronRight size={16} />
              </div>
            </Link>
          ))}
        </div>

        {/* Zip notice */}
        <div className="zip-notice" role="note">
          <FileArchive size={18} className="zip-icon" aria-hidden="true" />
          <p className="zip-text">
            <strong>Important:</strong> Please make sure your assignments are in{" "}
            <code className="zip-code">.zip</code> format before submitting.
            Other file types will be rejected.
          </p>
        </div>
      </div>

      <footer className="portal-footer">
        <p>Grade Portal &mdash; Secure Academic Submissions &mdash; Web Design I</p>
      </footer>
    </main>
  );
}