import { z } from "zod";

import type { Side } from "./three-way";

/**
 * A canvas merged shape by shape, the drawing counterpart of `three-way.ts`'s text merge.
 * Pure, like it: the scene arrives as the canvas serialized it (`lib/canvas/scene-model.ts`)
 * and leaves the same way. Only `id`, `version`, `index` and `pageId` are read.
 */
const elementSchema = z.looseObject({ id: z.string(), version: z.number() });
const sceneSchema = z.looseObject({ elements: z.array(elementSchema) });

type SceneElement = z.infer<typeof elementSchema>;

function parseScene(serialized: string) {
  try {
    const parsed = sceneSchema.safeParse(JSON.parse(serialized) as unknown);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * One shape, as the merge sees it. Undefined is "not in this version": never drawn, or
 * deleted — the canvas drops a deleted element rather than flagging it.
 */
function mergeElement(
  base: SceneElement | undefined,
  local: SceneElement | undefined,
  remote: SceneElement | undefined,
  prefer: Side,
): SceneElement | undefined {
  // An edit beats a delete: somebody still wanted the shape, and a shape brought back is
  // easier to delete again than one lost is to redraw.
  if (!local || !remote) {
    const kept = local ?? remote;

    return kept && base && kept.version === base.version ? undefined : kept;
  }

  if (local.version === remote.version) {
    return prefer === "local" ? local : remote;
  }

  if (base && local.version === base.version) {
    return remote;
  }

  if (base && remote.version === base.version) {
    return local;
  }

  return local.version > remote.version ? local : remote;
}

/**
 * Brings back a page that ink still points at. One device deleting a page while another
 * writes on it leaves the new ink (an edit beats a delete) but not its page, and ink with
 * no page has nowhere to be drawn. The page comes back from whichever side still has it,
 * one version up, so the next merge keeps it too.
 */
function restoreLostPages(
  elements: SceneElement[],
  sources: ReadonlyArray<ReadonlyMap<string, SceneElement>>,
) {
  const present = new Set(elements.map((element) => element.id));
  const wanted = new Set(
    elements.flatMap((element) => (typeof element.pageId === "string" ? [element.pageId] : [])),
  );

  for (const pageId of wanted) {
    const page = present.has(pageId)
      ? undefined
      : sources.map((source) => source.get(pageId)).find((found) => found !== undefined);
    if (page) {
      elements.push({ ...page, version: page.version + 1 });
      present.add(pageId);
    }
  }
}

/**
 * Two edits of one canvas, merged shape by shape.
 *
 * The canvas bumps an element's `version` on every change, so "did this side touch it" is a
 * comparison with the base rather than a diff. Everything else in the scene — the view, the
 * tool — is this device's own and is kept from the local side. A scene that does not parse
 * is not merged at all: the preferred side is kept whole.
 */
export function mergeScenes(
  base: string | null,
  local: string,
  remote: string,
  prefer: Side,
): string {
  const [baseScene, localScene, remoteScene] = [
    base ? parseScene(base) : null,
    parseScene(local),
    parseScene(remote),
  ];

  if (!localScene || !remoteScene) {
    return prefer === "local" ? local : remote;
  }

  const byId = (scene: { elements: SceneElement[] } | null) =>
    new Map((scene?.elements ?? []).map((element) => [element.id, element]));
  const [baseById, localById, remoteById] = [byId(baseScene), byId(localScene), byId(remoteScene)];
  const ids = [...new Set([...localById.keys(), ...remoteById.keys()])];

  const elements = ids
    .map((id) => mergeElement(baseById.get(id), localById.get(id), remoteById.get(id), prefer))
    .filter((element): element is SceneElement => element !== undefined);

  restoreLostPages(elements, [localById, remoteById, baseById]);

  // Stacking order is the fractional `index` the canvas gives every element, when all of
  // them have one; otherwise the local order stands, with the other side's new shapes on top.
  if (elements.every((element) => typeof element.index === "string")) {
    elements.sort((left, right) => {
      const [a, b] = [String(left.index), String(right.index)];

      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  return JSON.stringify({ ...localScene, elements });
}
