import { z } from "zod";

/**
 * The environment, parsed rather than read.
 *
 * Nothing here has a default that would matter if it were wrong. A missing `SERVER_SECRET`
 * is not a reason to invent one: the decoy KDF parameters derive from it, so a secret that
 * changes between restarts makes the decoys inconsistent, and an inconsistent decoy is
 * exactly the tell it exists to avoid.
 */
const configSchema = z.object({
  databaseUrl: z.string().min(1),
  serverSecret: z.string().min(16),
  allowedOrigins: z.array(z.string()),
  port: z.number().int().positive().max(65_535),
  /** How often the reminder sweep runs. A minute is finer than any due time is written. */
  sweepEveryMs: z.number().int().positive(),
  /** Absent means this deployment sends no reminders, which is a choice, not a failure. */
  vapid: z
    .object({
      subject: z.string().min(1),
      publicKey: z.string().min(1),
      privateKey: z.string().min(1),
    })
    .nullable(),
});

export type ServerConfig = z.infer<typeof configSchema>;

export type Environment = Record<string, string | undefined>;

function numberOr(value: string | undefined, fallback: number): number {
  return value === undefined || value === "" ? fallback : Number(value);
}

/**
 * VAPID is all three values or none of them. Two out of three is a deployment that believes
 * it sends reminders and does not, which is worse than one that never claimed to.
 */
function vapidFrom(environment: Environment): ServerConfig["vapid"] {
  const subject = environment.VAPID_SUBJECT;
  const publicKey = environment.VAPID_PUBLIC_KEY;
  const privateKey = environment.VAPID_PRIVATE_KEY;

  if (!subject && !publicKey && !privateKey) {
    return null;
  }

  return { subject: subject ?? "", publicKey: publicKey ?? "", privateKey: privateKey ?? "" };
}

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`This server cannot start:\n${problems.map((line) => `  - ${line}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

/**
 * Throws with every problem at once rather than the first, so a first deploy takes one
 * round trip instead of four. The message names the variables and never their values.
 */
export function readConfig(environment: Environment): ServerConfig {
  const parsed = configSchema.safeParse({
    databaseUrl: environment.DATABASE_URL ?? "",
    serverSecret: environment.SERVER_SECRET ?? "",
    allowedOrigins: (environment.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    port: numberOr(environment.PORT, 8787),
    sweepEveryMs: numberOr(environment.REMINDER_SWEEP_MS, 60_000),
    vapid: vapidFrom(environment),
  });

  if (parsed.success) {
    return parsed.data;
  }

  const named: Record<string, string> = {
    databaseUrl: "DATABASE_URL is required (a Postgres connection string).",
    serverSecret: "SERVER_SECRET is required, and must be at least 16 characters.",
    port: "PORT must be a port number.",
    sweepEveryMs: "REMINDER_SWEEP_MS must be a positive number of milliseconds.",
    vapid: "VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together.",
  };

  throw new ConfigError([
    ...new Set(
      parsed.error.issues.map(
        (issue) => named[String(issue.path[0])] ?? `${String(issue.path[0])} is not valid.`,
      ),
    ),
  ]);
}
