/** What the planner calls things, and what the next few steps will set up. */
export function WelcomeStep() {
  return (
    <div className="grid gap-4 text-body">
      <p>
        Everything is filed like a school year: a <strong>term</strong> holds your{" "}
        <strong>courses</strong>, and each course holds its tasks, notes and files. Tasks show up on
        the Calendar, the Board and the Dashboard.
      </p>
      <p>The next few steps set that up:</p>
      <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
        <li>name this term and add your courses,</li>
        <li>import deadlines from your school&apos;s calendar,</li>
        <li>pick how the planner looks,</li>
        <li>and, if you want them, sync across devices and reminders.</li>
      </ul>
      <p className="text-muted-foreground">
        Each one can be skipped and done later from Settings. Press ⌘K (Ctrl+K on Windows) anywhere
        to jump to a page, a note or a task.
      </p>
    </div>
  );
}
