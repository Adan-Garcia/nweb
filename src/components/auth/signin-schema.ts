import { z } from "zod";

import { normalizeServerUrl } from "@/lib/api/server-url";

/**
 * Signing a new device in to an existing server account. The name is asked because the
 * local account is this device's own: the server keeps no profile to fill it from.
 */
export const serverSigninSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "That name is too long"),
  email: z.email("Enter a valid email address"),
  passphrase: z.string().min(1, "Enter the account's passphrase"),
  serverUrl: z.string().refine((value) => normalizeServerUrl(value) !== null, {
    message: "Enter the server's address, starting with https://",
  }),
});

export type ServerSigninValues = z.infer<typeof serverSigninSchema>;

export const unlockSchema = z.object({
  passphrase: z.string().min(1, "Enter your passphrase"),
});

export type UnlockValues = z.infer<typeof unlockSchema>;
