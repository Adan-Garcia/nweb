import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * jsdom cannot cover this: dnd-kit measures real rects to decide what a card is over, and
 * jsdom reports every element as zero-sized. The pointer path is the one almost every user
 * takes, so it only exists here. The keyboard path is covered in the unit tests.
 */
async function addTask(page: Page, title: string) {
  const add = page.getByRole("button", { name: "Add Task" });
  await expect(add).toBeEnabled();
  await add.click();

  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("button", { name: `Reorder ${title}` })).toBeVisible();
}

/**
 * Drags by the grip. The intermediate moves are what dnd-kit tracks a drag with, and the
 * repeated move at the end gives its sortable strategy a frame to settle before the drop:
 * the cards shift as the drag passes over them, so releasing immediately can land on
 * whatever slid under the pointer last.
 */
async function dragOnto(page: Page, grip: Locator, target: Locator) {
  const from = await grip.boundingBox();
  const to = await target.boundingBox();

  if (!from || !to) {
    throw new Error("could not measure the drag");
  }

  const toX = to.x + to.width / 2;
  const toY = to.y + to.height / 2;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 16 });
  await page.mouse.move(toX, toY);
  await page.waitForTimeout(100);
  await page.mouse.move(toX, toY);
  await page.mouse.up();
}

function columnTitles(page: Page, label: string) {
  return page
    .getByRole("list", { name: label })
    .getByRole("button", { name: /^Reorder / })
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label")?.replace("Reorder ", "")),
    );
}

test.describe("the board", () => {
  test("a card dragged to another column keeps its new status after a reload", async ({ page }) => {
    await page.goto("/board");
    await addTask(page, "Lab report");

    await dragOnto(
      page,
      page.getByRole("button", { name: "Reorder Lab report" }),
      page.getByRole("list", { name: "Started" }),
    );

    await expect(async () => {
      expect(await columnTitles(page, "Started")).toEqual(["Lab report"]);
    }).toPass();

    await page.reload();

    await expect(async () => {
      expect(await columnTitles(page, "Started")).toEqual(["Lab report"]);
      expect(await columnTitles(page, "Todo")).toEqual([]);
    }).toPass();
  });

  test("a card dragged over another keeps the new order after a reload", async ({ page }) => {
    await page.goto("/board");
    await addTask(page, "First");
    await addTask(page, "Second");

    await expect(async () => {
      expect(await columnTitles(page, "Todo")).toEqual(["First", "Second"]);
    }).toPass();

    await dragOnto(
      page,
      page.getByRole("button", { name: "Reorder First" }),
      page.getByRole("button", { name: "Reorder Second" }),
    );

    await expect(async () => {
      expect(await columnTitles(page, "Todo")).toEqual(["Second", "First"]);
    }).toPass();

    await page.reload();

    await expect(async () => {
      expect(await columnTitles(page, "Todo")).toEqual(["Second", "First"]);
    }).toPass();
  });
});

test.describe("the calendar", () => {
  test("a task dragged onto another day is rescheduled to it", async ({ page }) => {
    // Relative to today, so the drag never has to navigate between months.
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    target.setDate(target.getDate() + (today.getDate() > 20 ? -1 : 1));
    const targetLabel = target.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    await page.goto("/calendar");

    const add = page.getByRole("button", { name: "Add" });
    await expect(add).toBeEnabled();
    await add.click();
    await page.getByRole("menuitem", { name: "Add Event" }).click();
    await page.getByLabel("Title").fill("Quiz");
    await page.getByRole("button", { name: "Create event" }).click();

    const grip = page.getByRole("button", { name: "Move Quiz to another day" });
    await expect(grip).toBeVisible();

    await dragOnto(
      page,
      grip,
      page.getByRole("button", { name: `${target.getDate()}`, exact: true }),
    );

    await expect(page.getByText(new RegExp(`${targetLabel} at`))).toBeVisible();

    await page.reload();
    await expect(page.getByText(new RegExp(`${targetLabel} at`))).toBeVisible();
  });
});
