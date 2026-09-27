import { reload, visit } from "./account";
import { expect, test } from "./fixtures";

test("an event added on the calendar shows up on the dashboard and survives a reload", async ({
  page,
}) => {
  await visit(page, "/calendar");
  await page.getByRole("button", { name: "Add Event" }).click();
  await page.getByLabel("Title").fill("Chemistry lab report");
  await page.getByRole("button", { name: "Create event" }).click();

  // On the calendar: in the day's list.
  await expect(page.getByText("Chemistry lab report").first()).toBeVisible();

  // The dashboard reads the same stored events.
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(/Chemistry lab report on .* at 9:00 AM/)).toBeVisible();

  await reload(page);
  await expect(page.getByText(/Chemistry lab report on .* at 9:00 AM/)).toBeVisible();
});
