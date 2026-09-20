export const defaultLinearContent = `
<h2>Lecture Notes</h2>
<p>Switch between Linear and Spatial mode as needed. Linear mode is ideal for long-form writing.</p>
<p>Use this space for structured notes, summaries, and TODOs.</p>
`;

function getAcademicTerm(monthIndex: number) {
  if (monthIndex >= 0 && monthIndex <= 4) {
    return "Spring";
  }

  if (monthIndex >= 5 && monthIndex <= 7) {
    return "Summer";
  }

  return "Fall";
}

export function createDefaultNotesLocation() {
  const now = new Date();
  const year = now.getFullYear();
  const term = getAcademicTerm(now.getMonth());

  return {
    wing: "My Wing",
    flight: `${term} ${year}`,
    branch: "General",
    nest: "Inbox",
    feather: "Untitled note",
  };
}

export function sanitizeLocationSegment(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function slugifySegment(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "untitled";
}

export function buildNotesDocumentId(location: {
  wing: string;
  flight: string;
  branch: string;
  nest: string;
  feather: string;
}) {
  return [
    "notes",
    slugifySegment(location.wing),
    slugifySegment(location.flight),
    slugifySegment(location.branch),
    slugifySegment(location.nest),
    slugifySegment(location.feather),
  ].join("-");
}
