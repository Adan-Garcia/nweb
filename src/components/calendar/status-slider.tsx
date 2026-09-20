import { useEffect, useRef, useState } from "react";

import {
  STATUS_META,
  statusOrder,
  type CalendarEvent,
} from "@/components/calendar/calendar-shared";

const COMPLETE_COMMIT_DELAY_MS = 150;

type StatusSliderProps = {
  status: CalendarEvent["status"];
  onChangeStatus: (nextStatus: CalendarEvent["status"]) => void;
  eventTitle: string;
};

export function StatusSlider({
  status,
  onChangeStatus,
  eventTitle,
}: StatusSliderProps) {
  const [optimisticStatus, setOptimisticStatus] =
    useState<CalendarEvent["status"]>(status);
  const [isSliding, setIsSliding] = useState(false);
  const completeDelayTimeoutRef = useRef<number | undefined>(undefined);

  const clearPendingCompleteCommit = () => {
    if (completeDelayTimeoutRef.current) {
      window.clearTimeout(completeDelayTimeoutRef.current);
      completeDelayTimeoutRef.current = undefined;
    }
  };

  const scheduleCompleteCommit = () => {
    clearPendingCompleteCommit();
    completeDelayTimeoutRef.current = window.setTimeout(() => {
      onChangeStatus("complete");
      completeDelayTimeoutRef.current = undefined;
    }, COMPLETE_COMMIT_DELAY_MS);
  };

  const commitFromOptimisticState = (nextStatus: CalendarEvent["status"]) => {
    if (nextStatus === "complete") {
      scheduleCompleteCommit();
      return;
    }

    clearPendingCompleteCommit();
    onChangeStatus(nextStatus);
  };

  const [syncedStatus, setSyncedStatus] = useState(status);
  const [syncedIsSliding, setSyncedIsSliding] = useState(isSliding);

  if (syncedStatus !== status || syncedIsSliding !== isSliding) {
    setSyncedStatus(status);
    setSyncedIsSliding(isSliding);

    if (!isSliding) {
      setOptimisticStatus(status);
    }
  }

  useEffect(() => {
    return () => {
      clearPendingCompleteCommit();
    };
  }, []);

  const sliderValue = statusOrder.indexOf(optimisticStatus);

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1">
      <div
        className={`relative h-6 w-14 rounded-full p-1 transition-colors duration-200 ${STATUS_META[optimisticStatus].track}`}
      >
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={sliderValue}
          onChange={(event) => {
            const nextIndex = Number(event.target.value);
            const nextStatus = statusOrder[nextIndex] ?? "incomplete";
            setOptimisticStatus(nextStatus);
            if (!isSliding) {
              commitFromOptimisticState(nextStatus);
            }
          }}
          onPointerDown={() => {
            setIsSliding(true);
            clearPendingCompleteCommit();
          }}
          onPointerUp={() => {
            setIsSliding(false);
            commitFromOptimisticState(optimisticStatus);
          }}
          onPointerCancel={() => {
            setIsSliding(false);
            commitFromOptimisticState(optimisticStatus);
          }}
          onBlur={() => {
            setIsSliding(false);
            commitFromOptimisticState(optimisticStatus);
          }}
          aria-label={`Set status for ${eventTitle}. Current status ${STATUS_META[optimisticStatus].label}`}
          className="absolute inset-y-1 left-1 right-1 h-4 cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-4 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-0 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-track]:h-4 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-sm"
        />
      </div>
      <span className="inline-flex w-12  text-xs font-medium text-muted-foreground text-center justify-center">
        {STATUS_META[optimisticStatus].label}
      </span>
    </div>
  );
}
