import { describe, expect, it, vi } from "vitest";

import { cn, focusNextFieldOnEnter, isTypingTarget } from "./utils";

describe("cn", () => {
  it("keeps the type scale's sizes beside a text colour", () => {
    expect(cn("text-title", "text-muted-foreground")).toBe("text-title text-muted-foreground");
    expect(cn("text-caption font-medium", "text-destructive")).toBe(
      "text-caption font-medium text-destructive",
    );
  });

  it("lets a later size replace an earlier one", () => {
    expect(cn("text-sm", "text-heading")).toBe("text-heading");
    expect(cn("text-body", "text-title")).toBe("text-title");
  });
});

describe("focusNextFieldOnEnter", () => {
  function formWith(html: string) {
    const form = document.createElement("form");
    form.innerHTML = html;
    document.body.append(form);
    const submit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submit);

    const field = (id: string) => {
      const found = form.querySelector<HTMLElement>(`#${id}`);

      if (!found) {
        throw new Error(`no #${id}`);
      }

      return found;
    };

    return { form, submit, field };
  }

  function press(target: HTMLElement, form: HTMLFormElement, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true, ...init });
    target.dispatchEvent(event);
    focusNextFieldOnEnter(event, form);

    return event;
  }

  it("moves on from a field, and leaves the last one where it is", () => {
    const { form, field } = formWith('<input id="a" /><select id="b"></select>');

    field("a").focus();
    expect(press(field("a"), form).defaultPrevented).toBe(true);
    expect(field("b")).toHaveFocus();

    expect(press(field("b"), form).defaultPrevented).toBe(true);
    expect(field("b")).toHaveFocus();
    form.remove();
  });

  it("leaves other keys, buttons, text areas and composing input alone", () => {
    const { form, field } = formWith(
      '<input id="a" /><textarea id="t"></textarea><button id="go">Go</button>',
    );

    expect(press(field("a"), form, { key: "Tab" }).defaultPrevented).toBe(false);
    expect(press(field("a"), form, { isComposing: true }).defaultPrevented).toBe(false);
    expect(press(field("a"), form, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(press(field("t"), form).defaultPrevented).toBe(false);
    expect(press(field("go"), form).defaultPrevented).toBe(false);
    form.remove();
  });

  it("submits on Ctrl or ⌘ with Enter", () => {
    const { form, submit, field } = formWith('<input id="a" />');

    press(field("a"), form, { ctrlKey: true });
    press(field("a"), form, { metaKey: true });

    expect(submit).toHaveBeenCalledTimes(2);
    form.remove();
  });
});

describe("isTypingTarget", () => {
  it("knows text fields and editable content from everything else", () => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    // jsdom does not compute isContentEditable from the attribute.
    Object.defineProperty(editable, "isContentEditable", { value: true });

    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
