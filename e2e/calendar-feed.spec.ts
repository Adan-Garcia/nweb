import { visit } from "./account";
import { expect, test } from "./fixtures";

const FEED = "https://mycourses.example.edu/d2l/le/calendar/feed/user/feed.ics?token=secret";

/** Today as an iCalendar DATE, so the event lands in whichever month the test runs. */
function today(): string {
  const now = new Date();

  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function calendar(): string {
  const event = (uid: string, summary: string) => [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    "LOCATION:MECE.203.01-04 - Strength of Materials I",
    `DTSTART;VALUE=DATE:${today()}`,
    "END:VEVENT",
  ];

  return [
    "BEGIN:VCALENDAR",
    "X-WR-CALNAME:All Courses - myCourses",
    ...event("available", "Quiz 3 - Available"),
    ...event("due", "Quiz 3 - Due"),
    ...event("hours", "TA Office Hours"),
    "END:VCALENDAR",
  ].join("\r\n");
}

test("a subscribed calendar's events arrive on the calendar, filtered and filed by course", async ({
  page,
}) => {
  // A host that lets browsers read its feed, so no sync server is involved.
  await page.route(FEED, (route) =>
    route.fulfill({
      body: calendar(),
      contentType: "text/calendar",
      headers: { "access-control-allow-origin": "*" },
    }),
  );

  await visit(page, "/calendar");
  await page.getByRole("link", { name: "Subscribe" }).click();
  await expect(page).toHaveURL(/\/settings#feeds$/);

  await page.getByRole("button", { name: "Add a calendar" }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Calendar link").fill(FEED);
  await dialog.getByRole("button", { name: "Preview" }).click();
  await expect(dialog.getByLabel("Name")).toHaveValue("All Courses - myCourses");
  await expect(dialog.getByText("3 events kept, 0 hidden by rules.")).toBeVisible();

  await dialog.getByLabel("Add rules for a platform").selectOption("brightspace");
  await expect(dialog.getByText("1 events kept, 2 hidden by rules.")).toBeVisible();

  await dialog.getByRole("button", { name: "Add calendar" }).click();
  await expect(page.getByText("All Courses - myCourses is up to date")).toBeVisible();
  // The link is shown by host alone; the token in it is the secret part.
  await expect(page.getByText(/From mycourses\.example\.edu/)).toBeVisible();
  await expect(page.getByText(/token=secret/)).toHaveCount(0);

  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page.getByText("Quiz 3", { exact: true }).first()).toBeVisible();
  // Filed under a course named from the event's location and created for it, as an exam.
  await expect(page.getByText("MECE 203 Strength of Materials I · Exam")).toBeVisible();
  await expect(page.getByText(/Office Hours|Available/)).toHaveCount(0);
});
