// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ConfigError, type Environment, readConfig } from "./config";

const ENOUGH: Environment = {
  DATABASE_URL: "postgres://localhost/cuervo",
  SERVER_SECRET: "a-secret-long-enough",
};

describe("reading the environment", () => {
  it("takes the least a deployment can get away with", () => {
    expect(readConfig(ENOUGH)).toEqual({
      databaseUrl: "postgres://localhost/cuervo",
      serverSecret: "a-secret-long-enough",
      allowedOrigins: [],
      port: 8787,
      sweepEveryMs: 60_000,
      vapid: null,
      clientIpHeader: null,
      registrationEmails: null,
      staticDir: null,
    });
  });

  it("takes what a deployment behind a tunnel needs", () => {
    const config = readConfig({
      ...ENOUGH,
      CLIENT_IP_HEADER: " CF-Connecting-IP ",
      REGISTRATION_EMAILS: "Me@Example.com, friend@example.com,",
      STATIC_DIR: "/app/web",
    });

    expect(config).toMatchObject({
      clientIpHeader: "cf-connecting-ip",
      registrationEmails: ["me@example.com", "friend@example.com"],
      staticDir: "/app/web",
    });
  });

  it("splits the origins and drops the whitespace around them", () => {
    const config = readConfig({
      ...ENOUGH,
      ALLOWED_ORIGINS: "https://app.example.com, http://localhost:5173 ,",
    });

    expect(config.allowedOrigins).toEqual(["https://app.example.com", "http://localhost:5173"]);
  });

  it("takes a port and a sweep period when they are given", () => {
    const config = readConfig({ ...ENOUGH, PORT: "3000", REMINDER_SWEEP_MS: "5000" });

    expect(config).toMatchObject({ port: 3000, sweepEveryMs: 5000 });
  });

  it("names everything that is missing at once, not the first thing", () => {
    expect(() => readConfig({})).toThrow(ConfigError);

    try {
      readConfig({});
    } catch (error) {
      expect(String(error)).toContain("DATABASE_URL");
      expect(String(error)).toContain("SERVER_SECRET");
    }
  });

  it("refuses a server secret short enough to guess", () => {
    // It is not a password, but it is what the decoys derive from, and a short one makes
    // them reproducible by anybody who tries.
    expect(() => readConfig({ ...ENOUGH, SERVER_SECRET: "short" })).toThrow(/SERVER_SECRET/);
  });

  it("refuses a port that is not one", () => {
    expect(() => readConfig({ ...ENOUGH, PORT: "not-a-port" })).toThrow(/PORT/);
    expect(() => readConfig({ ...ENOUGH, PORT: "0" })).toThrow(/PORT/);
    expect(() => readConfig({ ...ENOUGH, REMINDER_SWEEP_MS: "-1" })).toThrow(/REMINDER_SWEEP_MS/);
  });
});

describe("push configuration", () => {
  it("is taken when all three parts are there", () => {
    const config = readConfig({
      ...ENOUGH,
      VAPID_SUBJECT: "mailto:ops@example.com",
      VAPID_PUBLIC_KEY: "public",
      VAPID_PRIVATE_KEY: "private",
    });

    expect(config.vapid).toEqual({
      subject: "mailto:ops@example.com",
      publicKey: "public",
      privateKey: "private",
    });
  });

  it("refuses two parts out of three rather than starting half-configured", () => {
    // A server that believes it sends reminders and does not is worse than one that never
    // claimed to: nothing fails, and nobody is told anything.
    expect(() =>
      readConfig({
        ...ENOUGH,
        VAPID_SUBJECT: "mailto:ops@example.com",
        VAPID_PUBLIC_KEY: "public",
      }),
    ).toThrow(/VAPID/);
  });

  it("refuses whichever two of the three are missing", () => {
    for (const partial of [
      { VAPID_SUBJECT: "mailto:ops@example.com" },
      { VAPID_PUBLIC_KEY: "public" },
      { VAPID_PRIVATE_KEY: "private" },
      { VAPID_PUBLIC_KEY: "public", VAPID_PRIVATE_KEY: "private" },
    ]) {
      expect(() => readConfig({ ...ENOUGH, ...partial })).toThrow(/VAPID/);
    }
  });

  it("never puts a value in the message, only the name of the variable", () => {
    try {
      readConfig({ ...ENOUGH, SERVER_SECRET: "sekrit" });
    } catch (error) {
      expect(String(error)).not.toContain("sekrit");
    }
  });
});
