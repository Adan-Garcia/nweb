import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CalendarEvent } from "@/lib/twigs/calendar-event";

import { StatusSlider } from "./status-slider";

afterEach(() => vi.useRealTimers());

function setup(status: CalendarEvent["status"] = "incomplete") {
  const onChangeStatus = vi.fn();
  const view = render(
    <StatusSlider status={status} onChangeStatus={onChangeStatus} eventTitle="Math Quiz" />,
  );
  const slider = () => screen.getByRole("slider");
  return { onChangeStatus, slider, ...view };
}

const move = (slider: HTMLElement, index: number) =>
  fireEvent.change(slider, { target: { value: String(index) } });

describe("StatusSlider", () => {
  it.each([
    ["incomplete", "Todo", "0"],
    ["inprogress", "Started", "1"],
    ["complete", "Done", "2"],
  ] as const)("shows %s as '%s'", (status, label, value) => {
    const { slider } = setup(status);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(slider()).toHaveValue(value);
  });

  it("names the event and its current status for assistive technology", () => {
    const { slider } = setup("inprogress");
    expect(slider()).toHaveAccessibleName("Set status for Math Quiz. Current status Started");
  });

  it("commits an intermediate status immediately", () => {
    const { slider, onChangeStatus } = setup();

    move(slider(), 1);

    expect(onChangeStatus).toHaveBeenCalledExactlyOnceWith("inprogress");
    expect(screen.getByText("Started")).toBeInTheDocument();
  });

  it("commits 'complete' only after a short delay, so it can still be dragged past", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { slider, onChangeStatus } = setup();

    move(slider(), 2);
    expect(onChangeStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Done")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(onChangeStatus).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChangeStatus).toHaveBeenCalledExactlyOnceWith("complete");
  });

  it("cancels a pending 'complete' if the slider moves on before the delay", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { slider, onChangeStatus } = setup();

    move(slider(), 2);
    move(slider(), 1);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onChangeStatus).toHaveBeenCalledExactlyOnceWith("inprogress");
  });

  it("waits for the pointer to be released while dragging, then commits once", () => {
    const { slider, onChangeStatus } = setup();

    fireEvent.pointerDown(slider());
    move(slider(), 1);
    move(slider(), 0);
    move(slider(), 1);
    expect(onChangeStatus).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider());
    expect(onChangeStatus).toHaveBeenCalledExactlyOnceWith("inprogress");
  });

  it.each([
    ["the pointer is cancelled", (slider: HTMLElement) => fireEvent.pointerCancel(slider)],
    ["focus leaves", (slider: HTMLElement) => fireEvent.blur(slider)],
  ])("also commits when %s mid-drag", (_reason, end) => {
    const { slider, onChangeStatus } = setup();

    fireEvent.pointerDown(slider());
    move(slider(), 1);
    end(slider());

    expect(onChangeStatus).toHaveBeenCalledExactlyOnceWith("inprogress");
  });

  it("follows the status when it changes from outside", () => {
    const { rerender, slider, onChangeStatus } = setup("incomplete");

    rerender(
      <StatusSlider status="complete" onChangeStatus={onChangeStatus} eventTitle="Math Quiz" />,
    );

    expect(slider()).toHaveValue("2");
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("does not commit a pending 'complete' after unmounting", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { slider, onChangeStatus, unmount } = setup();

    move(slider(), 2);
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onChangeStatus).not.toHaveBeenCalled();
  });
});
