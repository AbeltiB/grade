"use client";

import { useState, useMemo } from "react";
import { ExternalLink, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

interface Submission {
  id:            string;
  studentId:     string;
  firstName:     string;
  lastName:      string;
  batch:         string;
  phone:         string | null;
  instructorKey: "KIBROM" | "ZELALEM";
  assignmentKey: string;
  fileName:      string;
  zipUrl:        string;
  ipAddress:     string | null;
  createdAt:     string | Date;
}

const ASSIGNMENT_LABELS: Record<string, string> = {
  A1_HTML_CSS:    "HTML & CSS Basics",
  A2_JS:          "JavaScript Essentials",
  A2_BOOTSTRAP:   "Bootstrap Worksheet",
  A3_WEB_PROJECT: "Web Project",
};

const INSTRUCTOR_LABELS: Record<string, string> = {
  KIBROM:  "Dr. Kibrom",
  ZELALEM: "Mr. Zelalem",
};

const PAGE_SIZE = 25;

type SortKey = "createdAt" | "studentId" | "lastName" | "instructorKey" | "assignmentKey";
type SortDir = "asc" | "desc";

// ─── Extracted outside the parent component to satisfy react-hooks/static-components ───
function SortIcon({
  col,
  sortKey,
  sortDir,
}: {
  col:     SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
}) {
  if (sortKey !== col) {
    return <ChevronUp size={12} className="sort-icon sort-icon--inactive" />;
  }
  return sortDir === "asc"
    ? <ChevronUp size={12} className="sort-icon" />
    : <ChevronDown size={12} className="sort-icon" />;
}

export function SubmissionsTable({
  submissions,
}: {
  submissions: Submission[];
}) {
  const [search,      setSearch]      = useState("");
  const [filterInstr, setFilterInstr] = useState<string>("ALL");
  const [filterAsn,   setFilterAsn]   = useState<string>("ALL");
  const [sortKey,     setSortKey]     = useState<SortKey>("createdAt");
  const [sortDir,     setSortDir]     = useState<SortDir>("desc");
  const [page,        setPage]        = useState(1);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    let data = [...submissions];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter(
        (s) =>
          s.studentId.toLowerCase().includes(q) ||
          s.firstName.toLowerCase().includes(q) ||
          s.lastName.toLowerCase().includes(q) ||
          s.batch.toLowerCase().includes(q)
      );
    }

    if (filterInstr !== "ALL") {
      data = data.filter((s) => s.instructorKey === filterInstr);
    }

    if (filterAsn !== "ALL") {
      data = data.filter((s) => s.assignmentKey === filterAsn);
    }

    data.sort((a, b) => {
      let va: string | Date = a[sortKey] as string | Date;
      let vb: string | Date = b[sortKey] as string | Date;
      if (sortKey === "createdAt") {
        va = new Date(va);
        vb = new Date(vb);
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return data;
  }, [submissions, search, filterInstr, filterAsn, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  return (
    <div className="table-wrapper">
      {/* Controls */}
      <div className="table-controls">
        <div className="table-search-wrap">
          <Search size={15} className="table-search-icon" />
          <input
            className="table-search"
            type="text"
            placeholder="Search by ID, name, or batch…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="table-filters">
          <select
            className="table-filter-select"
            value={filterInstr}
            onChange={(e) => { setFilterInstr(e.target.value); setPage(1); }}
          >
            <option value="ALL">All Instructors</option>
            <option value="KIBROM">Dr. Kibrom</option>
            <option value="ZELALEM">Mr. Zelalem</option>
          </select>

          <select
            className="table-filter-select"
            value={filterAsn}
            onChange={(e) => { setFilterAsn(e.target.value); setPage(1); }}
          >
            <option value="ALL">All Assignments</option>
            <option value="A1_HTML_CSS">HTML &amp; CSS Basics</option>
            <option value="A2_JS">JavaScript Essentials</option>
            <option value="A2_BOOTSTRAP">Bootstrap Worksheet</option>
            <option value="A3_WEB_PROJECT">Web Project</option>
          </select>
        </div>

        <p className="table-count">
          {filtered.length} of {submissions.length} submissions
        </p>
      </div>

      {/* Table */}
      <div className="table-scroll">
        <table className="sub-table">
          <thead>
            <tr>
              <th className="th-numeric">#</th>
              <th
                className="th-sortable"
                onClick={() => toggleSort("studentId")}
              >
                Student ID{" "}
                <SortIcon col="studentId" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th
                className="th-sortable"
                onClick={() => toggleSort("lastName")}
              >
                Name{" "}
                <SortIcon col="lastName" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th>Batch</th>
              <th>Phone</th>
              <th
                className="th-sortable"
                onClick={() => toggleSort("instructorKey")}
              >
                Instructor{" "}
                <SortIcon col="instructorKey" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th
                className="th-sortable"
                onClick={() => toggleSort("assignmentKey")}
              >
                Assignment{" "}
                <SortIcon col="assignmentKey" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th>File</th>
              <th
                className="th-sortable"
                onClick={() => toggleSort("createdAt")}
              >
                Submitted{" "}
                <SortIcon col="createdAt" sortKey={sortKey} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="table-empty">
                  No submissions found.
                </td>
              </tr>
            ) : (
              pageRows.map((s, idx) => (
                <tr key={s.id} className="sub-row">
                  <td className="row-number-cell">{startIdx + idx + 1}</td>
                  <td>
                    <code className="student-id-cell">{s.studentId}</code>
                  </td>
                  <td className="name-cell">
                    {s.firstName} {s.lastName}
                  </td>
                  <td>
                    <code className="batch-cell">{s.batch}</code>
                  </td>
                  <td className="phone-cell">{s.phone ?? "—"}</td>
                  <td>
                    <span
                      className={`instr-badge ${
                        s.instructorKey === "KIBROM"
                          ? "instr-badge--kibrom"
                          : "instr-badge--zelalem"
                      }`}
                    >
                      {INSTRUCTOR_LABELS[s.instructorKey]}
                    </span>
                  </td>
                  <td>
                    <span className="asn-badge">
                      {ASSIGNMENT_LABELS[s.assignmentKey] ?? s.assignmentKey}
                    </span>
                  </td>
                  <td>
                    <a
                      href={s.zipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="file-link"
                      title={s.fileName}
                    >
                      <ExternalLink size={14} />
                      {s.fileName.length > 22
                        ? s.fileName.slice(0, 20) + "…"
                        : s.fileName}
                    </a>
                  </td>
                  <td className="date-cell">
                    {new Date(s.createdAt).toLocaleString("en-GB", {
                      day:    "2-digit",
                      month:  "short",
                      year:   "numeric",
                      hour:   "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="table-pagination">
          <button
            className="pagination-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          <span className="pagination-info">
            Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
            {" "}({filtered.length} rows)
          </span>

          <button
            className="pagination-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
