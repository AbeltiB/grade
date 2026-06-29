import { AssignmentKey, InstructorKey } from "@/generated/prisma/client";

export interface InstructorConfig {
  key:        InstructorKey;
  slug:       string;
  name:       string;
  title:      string;
  initials:   string;
  department: string;
}

export interface AssignmentConfig {
  key:         AssignmentKey;
  number:      number;
  label:       string;
  description: string;
}

export const INSTRUCTORS: InstructorConfig[] = [
  {
    key:        "KIBROM",
    slug:       "kibrom",
    name:       "Dr. Kibrom",
    title:      "Lecture Instructor",
    initials:   "DK",
    department: "Web Design I",
  },
  {
    key:        "ZELALEM",
    slug:       "zelalem",
    name:       "Mr. Zelalem",
    title:      "Lecture Instructor",
    initials:   "MZ",
    department: "Web Design I",
  },
];

export const ASSIGNMENTS_BY_INSTRUCTOR: Record<
  InstructorKey,
  AssignmentConfig[]
> = {
  KIBROM: [
    {
      key:         "A1_HTML_CSS",
      number:      1,
      label:       "HTML & CSS Basics",
      description: "Business License project — structure, styling, and layout.",
    },
    {
      key:         "A2_BOOTSTRAP",
      number:      2,
      label:       "Bootstrap Worksheet",
      description: "Responsive layouts and components using Bootstrap 5.",
    },
    {
      key:         "A3_WEB_PROJECT",
      number:      3,
      label:       "Web Project",
      description: "Final integrated web design project submission.",
    },
  ],
  ZELALEM: [
    {
      key:         "A1_HTML_CSS",
      number:      1,
      label:       "HTML & CSS Basics",
      description: "Business License project — structure, styling, and layout.",
    },
    {
      key:         "A2_JS",
      number:      2,
      label:       "JavaScript Essentials",
      description: "Core JS concepts, DOM manipulation, and event handling.",
    },
    {
      key:         "A3_WEB_PROJECT",
      number:      3,
      label:       "Web Project",
      description: "Final integrated web design project submission.",
    },
  ],
};

export function getInstructorBySlug(
  slug: string
): InstructorConfig | undefined {
  return INSTRUCTORS.find((i) => i.slug === slug);
}