import type { ReactNode } from "react";
import { House, Clock, Split, NotebookTabs, NotebookPen } from "lucide-react";

import type { LocationSegment } from "@/components/notes/location-hierarchy";

export type SegmentConfig = {
  prepend?: ReactNode;
  segment: LocationSegment;
  label: string;
  currentLabel: string;
  append?: string;
};

export const SEGMENT_CONFIGS: SegmentConfig[] = [
  {
    prepend: <House className="w-4 h-4" />,
    segment: "wing",
    label: "Wing",
    currentLabel: "Current Wing",
    append: "/",
  },
  {
    prepend: <Clock className="w-4 h-4" />,
    segment: "flight",
    label: "Flight",
    currentLabel: "Current Flight",
    append: "/",
  },
  {
    prepend: <Split className="w-4 h-4" />,
    segment: "branch",
    label: "Branch",
    currentLabel: "Current Branch",
    append: "/",
  },
  {
    prepend: <NotebookTabs className="w-4 h-4" />,
    segment: "nest",
    label: "Unit",
    currentLabel: "Current Unit",
    append: "/",
  },
  {
    prepend: <NotebookPen className="w-4 h-4" />,
    segment: "feather",
    label: "Note",
    currentLabel: "Current Note",
  },
];
