import { type PointerEvent, type RefObject, useCallback, useEffect, useRef } from "react";

import type { CanvasCamera } from "@/components/notes/spatial/use-canvas-camera";
import type { CanvasSceneState } from "@/components/notes/spatial/use-canvas-scene";
import { pinch, toScene } from "@/lib/canvas/camera";
import type { Point } from "@/lib/canvas/geometry";
import type { Gesture, GestureContext, GestureUpdate, ToolStyle } from "@/lib/canvas/gesture-types";
import { scanNearby } from "@/lib/canvas/gesture-types";
import { startGesture } from "@/lib/canvas/gestures";
import {
  INITIAL_INPUT_STATE,
  type InputSettings,
  penNear,
  pointerDown,
  type PointerKind,
  pointerUp,
} from "@/lib/canvas/input-filter";
import { layoutById, layoutPages, orderedPages } from "@/lib/canvas/pages";
import type { PlacedElement } from "@/lib/canvas/scene-model";
import type { InputSample } from "@/lib/canvas/stroke-geometry";
import { type CanvasTool, isInkTool } from "@/lib/canvas/tools";

/** The eraser's reach in screen pixels, whatever the zoom. */
const ERASER_SCREEN_RADIUS = 10;

type Preview = { elements: readonly PlacedElement[]; lasso: readonly Point[] | null };

type PointerOptions = {
  surfaceRef: RefObject<HTMLCanvasElement | null>;
  sceneState: CanvasSceneState;
  camera: CanvasCamera;
  tool: CanvasTool;
  style: ToolStyle;
  settings: InputSettings;
  isReadOnly: boolean;
  drawLive: (preview: Preview) => void;
  setHidden: (hidden: ReadonlySet<string>) => void;
};

function kindOf(pointerType: string): PointerKind {
  return pointerType === "pen" || pointerType === "touch" ? pointerType : "mouse";
}

/**
 * Routes pointer input on the canvas: the pen and a drawing finger run the current tool's
 * gesture, a panning finger or the middle button moves the view, and two fingers pinch.
 */
export function useCanvasPointer(options: PointerOptions) {
  const { surfaceRef, sceneState, camera, tool, style, settings, isReadOnly, drawLive, setHidden } =
    options;
  const { liveRef, setSelection, beginGesture, updateGesture, endGesture } = sceneState;
  const { cancelGesture: abandonGesture } = sceneState;
  const { cameraRef, setCamera, pan } = camera;
  const inputRef = useRef(INITIAL_INPUT_STATE);
  const gestureRef = useRef<{ pointerId: number; gesture: Gesture } | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const panRef = useRef<{ pointerId: number; last: Point } | null>(null);
  const pinchRef = useRef<{
    start: typeof camera.camera;
    from: [Point, Point];
    to: [Point, Point];
    ids: [number, number];
  } | null>(null);
  const selectionRef = useRef(sceneState.selection);

  useEffect(() => {
    selectionRef.current = sceneState.selection;
  }, [sceneState.selection]);

  const context = useCallback(
    (shift: boolean): GestureContext => {
      const scene = liveRef.current.scene;
      const pages = layoutPages(orderedPages(scene));
      const pagesById = layoutById(pages);

      return {
        scene,
        pages,
        pagesById,
        style,
        shift,
        radius: ERASER_SCREEN_RADIUS / cameraRef.current.zoom,
        nearby: scanNearby(scene.elements, pagesById),
        newId: () => crypto.randomUUID(),
      };
    },
    [cameraRef, liveRef, style],
  );

  const localPoint = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = surfaceRef.current?.getBoundingClientRect();

      return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
    },
    [surfaceRef],
  );

  const sampleOf = useCallback(
    (event: globalThis.PointerEvent): InputSample => ({
      ...toScene(cameraRef.current, localPoint(event)),
      pressure: event.pressure,
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      time: event.timeStamp,
    }),
    [cameraRef, localPoint],
  );

  const apply = useCallback(
    (update: GestureUpdate) => {
      if (update.elements) {
        updateGesture(update.elements);
      }
      if (update.selection) {
        setSelection(new Set(update.selection));
      }
    },
    [setSelection, updateGesture],
  );

  const showPreview = useCallback(() => {
    const preview = gestureRef.current?.gesture.preview();
    drawLive(preview ?? { elements: [], lasso: null });
    setHidden(preview?.hidden ?? new Set());
  }, [drawLive, setHidden]);

  /** Throws away a gesture a pinch turned out to have started. */
  const cancelGesture = useCallback(() => {
    if (gestureRef.current) {
      gestureRef.current = null;
      abandonGesture();
      showPreview();
    }
  }, [abandonGesture, showPreview]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const native = event.nativeEvent;
      const point = localPoint(native);
      pointersRef.current.set(event.pointerId, point);
      event.currentTarget.setPointerCapture?.(event.pointerId);

      const decision = pointerDown(
        inputRef.current,
        {
          pointerId: event.pointerId,
          pointerType: kindOf(event.pointerType),
          button: event.button,
          time: event.timeStamp,
        },
        settings,
        isInkTool(tool) && !isReadOnly,
      );
      inputRef.current = decision.state;

      if (decision.action === "pinch") {
        if (decision.cancelStroke) {
          cancelGesture();
        }
        const [first, second] = [...pointersRef.current.entries()].slice(-2);
        pinchRef.current = {
          start: cameraRef.current,
          from: [first[1], second[1]],
          to: [first[1], second[1]],
          ids: [first[0], second[0]],
        };
        panRef.current = null;
        return;
      }
      if (decision.action === "pan" || (decision.action === "tool" && isReadOnly)) {
        panRef.current = { pointerId: event.pointerId, last: point };
        return;
      }
      if (decision.action !== "tool" || gestureRef.current) {
        return;
      }

      const gestureContext = context(event.shiftKey);
      const gesture = startGesture(tool, sampleOf(native), gestureContext, selectionRef.current);
      if (!gesture) {
        return;
      }
      gestureRef.current = { pointerId: event.pointerId, gesture };
      beginGesture();
      apply(gesture.start);
      showPreview();
    },
    [
      apply,
      beginGesture,
      cameraRef,
      cancelGesture,
      context,
      isReadOnly,
      localPoint,
      sampleOf,
      settings,
      showPreview,
      tool,
    ],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const native = event.nativeEvent;
      if (event.pointerType === "pen") {
        inputRef.current = penNear(inputRef.current, event.timeStamp);
      }
      const point = localPoint(native);
      if (pointersRef.current.has(event.pointerId)) {
        pointersRef.current.set(event.pointerId, point);
      }

      const pinching = pinchRef.current;
      const finger = pinching ? pinching.ids.indexOf(event.pointerId) : -1;
      if (pinching && finger !== -1) {
        pinching.to[finger] = point;
        setCamera(pinch(pinching.start, pinching.from, pinching.to));
        return;
      }

      const panning = panRef.current;
      if (panning?.pointerId === event.pointerId) {
        pan(point.x - panning.last.x, point.y - panning.last.y);
        panning.last = point;
        return;
      }

      const active = gestureRef.current;
      if (active?.pointerId !== event.pointerId) {
        return;
      }
      const events = native.getCoalescedEvents?.() ?? [];
      for (const sample of events.length ? events : [native]) {
        apply(active.gesture.move(sampleOf(sample), context(event.shiftKey)));
      }
      showPreview();
    },
    [apply, context, localPoint, pan, sampleOf, setCamera, showPreview],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      inputRef.current = pointerUp(inputRef.current, {
        pointerId: event.pointerId,
        pointerType: kindOf(event.pointerType),
        time: event.timeStamp,
      });
      pointersRef.current.delete(event.pointerId);
      if (pinchRef.current?.ids.includes(event.pointerId)) {
        pinchRef.current = null;
      }
      if (panRef.current?.pointerId === event.pointerId) {
        panRef.current = null;
      }

      const active = gestureRef.current;
      if (active?.pointerId !== event.pointerId) {
        return;
      }
      gestureRef.current = null;
      const update = active.gesture.end(context(event.shiftKey));
      endGesture(update.elements);
      if (update.selection) {
        setSelection(new Set(update.selection));
      }
      showPreview();
    },
    [context, endGesture, setSelection, showPreview],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
