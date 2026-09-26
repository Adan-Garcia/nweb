import type { ReminderState } from "@/components/settings/use-reminders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RemindersCardProps = {
  state: ReminderState;
  isWorking: boolean;
  onEnable: () => void;
  onDisable: () => void;
};

/**
 * What a reminder can and cannot say, offered as a switch.
 *
 * The copy is the feature as much as the button is. A notification from this app will read
 * "something is due at nine" and nothing more, because the server composing it has never
 * seen a title and the service worker cannot read one while the workspace is locked.
 * Promising more would be promising something the encryption makes impossible.
 */
const EXPLANATIONS: Record<ReminderState, string> = {
  loading: "Checking whether reminders are available…",
  unavailable:
    "This deployment does not send reminders. Nothing is wrong — the server it talks to has no push keys configured.",
  unsupported:
    "This browser cannot show reminders. Push needs a service worker, which is not available here — a private window, or an app that has not been installed.",
  off: "Reminders are off. Turning them on lets this device be woken when a task is nearly due.",
  on: "Reminders are on. This device will be woken when a task is nearly due.",
  denied:
    "This browser is set to block notifications from this site. Turning them on again has to be done in the browser, next to the address bar.",
};

export function RemindersCard({ state, isWorking, onEnable, onDisable }: RemindersCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminders</CardTitle>
        <CardDescription>{EXPLANATIONS[state]}</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        {state === "off" ? (
          <div>
            <Button type="button" size="sm" disabled={isWorking} onClick={onEnable}>
              Turn on reminders
            </Button>
          </div>
        ) : null}

        {state === "on" ? (
          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isWorking}
              onClick={onDisable}
            >
              Turn off reminders
            </Button>
          </div>
        ) : null}

        {state === "on" || state === "off" ? (
          <p className="m-0 text-sm text-muted-foreground">
            What a reminder will say: that something is due, and when. Not what it is. The server
            that sends it holds your task titles as ciphertext and has never seen one, and the part
            of the app that wakes up cannot read them either while the workspace is locked. Open the
            app to see what it was.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
