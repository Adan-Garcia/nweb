import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";

import {
  coursesFormFor,
  coursesFormSchema,
  type CoursesFormValues,
  type CoursesOrigin,
  planCourseChanges,
} from "@/components/onboarding/onboarding-courses-utils";
import { createBranch, renameBranch, renameFlight } from "@/lib/hierarchy/entity-storage";
import { ensureDefaultWorkspace } from "@/lib/hierarchy/workspace-storage";

/**
 * The term-and-courses step: read what the workspace has — a fresh device's placeholder, or
 * a synced account's real courses — and write back what was typed.
 */
export function useOnboardingCourses() {
  const [origin, setOrigin] = useState<CoursesOrigin | null>(null);
  const form = useForm<CoursesFormValues>({
    resolver: zodResolver(coursesFormSchema),
    defaultValues: { term: "", courses: [] },
  });
  const courses = useFieldArray({ control: form.control, name: "courses" });
  const { reset } = form;

  useEffect(() => {
    let isMounted = true;

    void ensureDefaultWorkspace().then(({ snapshot, path }) => {
      if (!isMounted) {
        return;
      }

      const next = coursesFormFor(snapshot, path.flight);

      setOrigin(next.origin);
      reset(next.values);
    });

    return () => {
      isMounted = false;
    };
  }, [reset]);

  /** Writes the changes, then reads the workspace back so a second save starts from them. */
  const save = async (values: CoursesFormValues) => {
    if (!origin) {
      return;
    }

    const changes = planCourseChanges(origin, values);

    if (changes.term !== null) {
      await renameFlight(origin.flightId, changes.term);
    }

    for (const { branchId, name } of changes.renames) {
      await renameBranch(branchId, name);
    }

    for (const name of changes.creates) {
      await createBranch({ flightId: origin.flightId, name });
    }

    const { snapshot, path } = await ensureDefaultWorkspace();
    const next = coursesFormFor(snapshot, path.flight);

    setOrigin(next.origin);
    reset(next.values);
  };

  return {
    form,
    rows: courses.fields,
    isLoading: origin === null,
    addRow: () => courses.append({ branchId: null, name: "" }),
    removeRow: courses.remove,
    save,
  };
}
