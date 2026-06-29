import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SubmissionsTable } from "@/components/dashboard/Submissionstable";
import { LogoutButton } from "@/components/dashboard/LogoutButton";
import { GraduationCap, Users, FileCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard — Grade Portal",
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.isAuthenticated) redirect("/dashboard/login");

  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id:            true,
      studentId:     true,
      firstName:     true,
      lastName:      true,
      batch:         true,
      phone:         true,
      instructorKey: true,
      assignmentKey: true,
      fileName:      true,
      zipUrl:        true,
      ipAddress:     true,
      createdAt:     true,
    },
  });

  const totalStudents = new Set(submissions.map((s) => s.studentId)).size;
  const kibromCount   = submissions.filter((s) => s.instructorKey === "KIBROM").length;
  const zelalemCount  = submissions.filter((s) => s.instructorKey === "ZELALEM").length;

  return (
    <main className="dash-root">
      <div className="bg-blob bg-blob--1" aria-hidden="true" />

      {/* Topbar */}
      <header className="dash-topbar">
        <div className="dash-topbar-inner">
          <div className="dash-brand">
            <GraduationCap size={22} strokeWidth={1.5} />
            <span>Grade Dashboard</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="dash-container">
        {/* Page title */}
        <div className="dash-page-header">
          <h1 className="dash-page-title">Submissions</h1>
          <p className="dash-page-sub">
            Web Design I &mdash; All assignment submissions
          </p>
        </div>

        {/* Stats row */}
        <div className="dash-stats-row">
          <div className="dash-stat">
            <div className="dash-stat-icon dash-stat-icon--total">
              <FileCheck size={18} />
            </div>
            <div>
              <p className="dash-stat-value">{submissions.length}</p>
              <p className="dash-stat-label">Total Submissions</p>
            </div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-icon dash-stat-icon--students">
              <Users size={18} />
            </div>
            <div>
              <p className="dash-stat-value">{totalStudents}</p>
              <p className="dash-stat-label">Unique Students</p>
            </div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-icon dash-stat-icon--kibrom">
              <span className="stat-initials">DK</span>
            </div>
            <div>
              <p className="dash-stat-value">{kibromCount}</p>
              <p className="dash-stat-label">Dr. Kibrom</p>
            </div>
          </div>
          <div className="dash-stat">
            <div className="dash-stat-icon dash-stat-icon--zelalem">
              <span className="stat-initials">MZ</span>
            </div>
            <div>
              <p className="dash-stat-value">{zelalemCount}</p>
              <p className="dash-stat-label">Mr. Zelalem</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <SubmissionsTable submissions={submissions} />
      </div>
    </main>
  );
}