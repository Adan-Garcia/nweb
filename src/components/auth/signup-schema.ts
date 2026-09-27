import { z } from "zod";

import { normalizeServerUrl } from "@/lib/api/server-url";

/**
 * What setting up the local account asks for.
 *
 * A new device chooses a passphrase, twice, at least eight characters. A device from before
 * local accounts already has one, so it is asked once and checked against the lock instead:
 * no length rule applies to a passphrase that already exists.
 */
export function signupSchema(hasPassphrase: boolean) {
  return z
    .object({
      name: z.string().trim().min(1, "Enter your name").max(80, "That name is too long"),
      email: z.email("Enter a valid email address"),
      passphrase: hasPassphrase
        ? z.string().min(1, "Enter this device's passphrase")
        : z.string().min(8, "Use at least 8 characters"),
      confirmPassphrase: z.string(),
      withServer: z.boolean(),
      serverUrl: z.string(),
    })
    .superRefine((values, context) => {
      if (!hasPassphrase && values.passphrase !== values.confirmPassphrase) {
        context.addIssue({
          code: "custom",
          message: "The passphrases do not match",
          path: ["confirmPassphrase"],
        });
      }

      if (values.withServer && !normalizeServerUrl(values.serverUrl)) {
        context.addIssue({
          code: "custom",
          message: "Enter the server's address, starting with https://",
          path: ["serverUrl"],
        });
      }
    });
}

export type SignupValues = z.infer<ReturnType<typeof signupSchema>>;
