import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { PageThumbnail } from "@/components/notes/spatial/page-thumbnail";
import type { CanvasPages } from "@/components/notes/spatial/use-canvas-pages";
import { Button } from "@/components/ui/button";
import { useAppearance } from "@/hooks/use-appearance";
import type { OutlineCache } from "@/lib/canvas/render-elements";
import { isPlaced } from "@/lib/canvas/scene-edits";
import type { PlacedElement, Scene } from "@/lib/canvas/scene-model";

type PageThumbnailsProps = {
  scene: Scene;
  pages: CanvasPages;
  images: ReadonlyMap<string, CanvasImageSource>;
  isReadOnly: boolean;
};

/**
 * The strip down the left of a paged note: every page small, the one in view marked, and
 * buttons to add a page after it, move it and delete it.
 */
export function PageThumbnails({ scene, pages, images, isReadOnly }: PageThumbnailsProps) {
  const { isDark } = useAppearance();
  const [cache] = useState<OutlineCache>(() => new Map());
  const { pages: placed, currentId } = pages;
  const position = placed.findIndex(({ page }) => page.id === currentId);

  const byPage = useMemo(() => {
    const grouped = new Map<string, PlacedElement[]>();
    for (const element of scene.elements.filter(isPlaced)) {
      if (element.pageId) {
        grouped.set(element.pageId, [...(grouped.get(element.pageId) ?? []), element]);
      }
    }

    return grouped;
  }, [scene]);

  const action = (label: string, Icon: typeof Plus, onClick: () => void, disabled = false) => (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="size-4" />
    </Button>
  );

  return (
    <nav
      aria-label="Pages"
      className="absolute top-16 bottom-3 left-3 z-10 flex w-28 flex-col gap-2 rounded-2xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-md backdrop-blur"
    >
      {isReadOnly || !currentId ? null : (
        <div className="flex flex-wrap justify-center" role="group" aria-label="This page">
          {action("Add page after this one", Plus, pages.add)}
          {action(
            "Move page up",
            ChevronUp,
            () => pages.move(currentId, position - 1),
            position < 1,
          )}
          {action(
            "Move page down",
            ChevronDown,
            () => pages.move(currentId, position + 1),
            position >= placed.length - 1,
          )}
          {action("Delete page", Trash2, () => pages.remove(currentId), placed.length < 2)}
        </div>
      )}
      <ol className="m-0 flex min-h-0 list-none flex-col items-center gap-1 overflow-y-auto p-0">
        {placed.map((page, i) => (
          <li key={page.page.id}>
            <PageThumbnail
              placed={page}
              number={i + 1}
              elements={byPage.get(page.page.id) ?? []}
              images={images}
              cache={cache}
              isDark={isDark}
              isCurrent={page.page.id === currentId}
              onSelect={pages.goTo}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}
