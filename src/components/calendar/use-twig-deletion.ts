import { useState } from "react";

import type { Twig } from "@/lib/twigs/twig-model";
import type { SeriesScope } from "@/lib/twigs/twig-series";

/**
 * The task waiting on a "delete it?" answer. The board and the calendar both ask through
 * `DeleteTwigDialog`, so a repeating task offers the same three choices in both places.
 */
export function useTwigDeletion(deleteTwig: (twig: Twig, scope: SeriesScope) => Promise<void>) {
  const [pending, setPending] = useState<Twig | null>(null);

  const confirm = async (scope: SeriesScope) => {
    if (!pending) {
      return;
    }

    setPending(null);
    await deleteTwig(pending, scope);
  };

  return { pending, request: setPending, cancel: () => setPending(null), confirm };
}
