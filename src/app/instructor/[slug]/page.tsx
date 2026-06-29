import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileArchive } from "lucide-react";
import { getInstructorBySlug, ASSIGNMENTS_BY_INSTRUCTOR } from "@/lib/config";
import { AssignmentCard } from "@/components/Assignmentcard";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const instructor = getInstructorBySlug(slug);
  if (!instructor) return {};
  return {
    title: `Submit to ${instructor.name} — Grade Portal`,
  };
}

export default async function InstructorPage({ params }: PageProps) {
  const { slug } = await params;
  const instructor = getInstructorBySlug(slug);

  if (!instructor) notFound();

  const assignments = ASSIGNMENTS_BY_INSTRUCTOR[instructor.key];

  return (
    <main className="portal-root">
      <div className="bg-blob bg-blob--1" aria-hidden="true" />
      <div className="bg-blob bg-blob--2" aria-hidden="true" />

      <div className="portal-container">
        {/* Back nav */}
        <div className="back-nav">
          <Link href="/" className="back-link">
            <ArrowLeft size={16} />
            Back to instructors
          </Link>
        </div>

        {/* Instructor header */}
        <div className="instructor-header">
          <div className="instr-avatar-lg">
            <span>{instructor.initials}</span>
          </div>
          <div className="instr-meta">
            <p className="instr-dept">{instructor.department}</p>
            <h1 className="instr-name">{instructor.name}</h1>
            <p className="instr-title-text">{instructor.title}</p>
          </div>
        </div>

        {/* Section divider */}
        <div className="section-divider" style={{ marginBottom: "36px" }}>
          <span />
          <span className="divider-label">Select Assignment</span>
          <span />
        </div>

        {/* Assignment cards */}
        <div className="assignment-grid">
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.key}
              assignment={assignment}
              instructorKey={instructor.key}
              instructorName={instructor.name}
            />
          ))}
        </div>

        {/* Zip notice */}
        <div className="zip-notice" role="note" style={{ marginTop: "12px" }}>
          <FileArchive size={18} className="zip-icon" aria-hidden="true" />
          <p className="zip-text">
            <strong>Important:</strong> Submissions must be in{" "}
            <code className="zip-code">.zip</code> format. Other file types
            will be rejected. One submission per assignment — choose carefully.
          </p>
        </div>
      </div>

      <footer className="portal-footer">
        <p>Grade Portal &mdash; Web Design I</p>
      </footer>
    </main>
  );
}