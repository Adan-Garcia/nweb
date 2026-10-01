import {
  FileDown,
  FilePlus2,
  FileUp,
  Fullscreen,
  ImageDown,
  LayoutPanelLeft,
  ScanSearch,
} from "lucide-react";

import { MenuItem, MenuToggle } from "@/components/notes/spatial/canvas-menu-items";
import type { CanvasInputSettings } from "@/components/notes/spatial/use-canvas-input-settings";

export type CanvasMoreActions = {
  onFit: () => void;
  /** Given only for a paged note. */
  pages?: { isShown: boolean; onToggle: () => void; onAdd: () => void };
  onImportPdf: () => void;
  isImportingPdf: boolean;
  onExportPng: () => void;
  onExportPdf: () => void;
  isExporting: boolean;
  /** Given on a narrow screen, where fullscreen has no room in the toolbar. */
  onToggleFullscreen?: () => void;
  input: CanvasInputSettings;
  /** Shared to read: only what looks at the drawing, nothing that changes it. */
  isReadOnly: boolean;
};

/** Everything the toolbar has no room for: the view, pages, import, export and input. */
export function CanvasMoreMenu({
  actions,
  onDone,
}: {
  actions: CanvasMoreActions;
  onDone: () => void;
}) {
  const { pages, input } = actions;
  const then = (action: () => void) => () => {
    action();
    onDone();
  };

  return (
    <>
      <div className="flex flex-col" role="group" aria-label="View">
        <MenuItem label="Zoom to fit" Icon={ScanSearch} onClick={then(actions.onFit)} />
        {pages ? (
          <MenuItem
            label="Page thumbnails"
            Icon={LayoutPanelLeft}
            onClick={then(pages.onToggle)}
            pressed={pages.isShown}
          />
        ) : null}
        {actions.onToggleFullscreen ? (
          <MenuItem
            label="Full screen"
            Icon={Fullscreen}
            onClick={then(actions.onToggleFullscreen)}
          />
        ) : null}
      </div>
      {actions.isReadOnly ? null : (
        <div className="flex flex-col" role="group" aria-label="Add">
          {pages ? (
            <MenuItem label="Add page" Icon={FilePlus2} onClick={then(pages.onAdd)} />
          ) : null}
          <MenuItem
            label={actions.isImportingPdf ? "Importing PDF…" : "Insert PDF"}
            Icon={FileUp}
            onClick={then(actions.onImportPdf)}
            disabled={actions.isImportingPdf}
          />
        </div>
      )}
      <div className="flex flex-col" role="group" aria-label="Export">
        <MenuItem
          label="Export as PNG"
          Icon={ImageDown}
          onClick={then(actions.onExportPng)}
          disabled={actions.isExporting}
        />
        <MenuItem
          label="Export as PDF"
          Icon={FileDown}
          onClick={then(actions.onExportPdf)}
          disabled={actions.isExporting}
        />
      </div>
      {actions.isReadOnly ? null : (
        <div className="flex flex-col" role="group" aria-label="Input on this device">
          <MenuToggle
            label="Draw with finger"
            hint="Otherwise fingers pan once a pen has been used here."
            checked={input.settings.fingerDraws === true}
            onChange={(checked) => input.update({ fingerDraws: checked ? true : "auto" })}
          />
          <MenuToggle
            label="Stylus only"
            hint="The mouse pans and selects, and never draws."
            checked={input.settings.stylusOnly}
            onChange={(stylusOnly) => input.update({ stylusOnly })}
          />
        </div>
      )}
    </>
  );
}
