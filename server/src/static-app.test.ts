// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app";
import type { Sql } from "./db";
import { createTestDb } from "./test-db";

let database: Sql & { close: () => Promise<void> };
let directory: string;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  database = await createTestDb();
  directory = mkdtempSync(join(tmpdir(), "cuervo-web-"));
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "index.html"), "<!doctype html><title>Cuervo</title>");
  writeFileSync(join(directory, "sw.js"), "self.addEventListener('fetch', () => {});");
  writeFileSync(join(directory, "assets", "index-abc123.js"), "console.log(1)");
  // Beside the directory, where a request must never reach.
  writeFileSync(join(directory, "..", `secret-${directory.split("-").at(-1)}.txt`), "secret");
  app = createApp({
    sql: database,
    serverSecret: "a secret this server keeps",
    allowedOrigins: [],
    staticDir: directory,
  });
});

afterEach(async () => {
  rmSync(directory, { recursive: true, force: true });
  rmSync(join(directory, "..", `secret-${directory.split("-").at(-1)}.txt`), { force: true });
  await database.close();
});

describe("serving the app beside the API", () => {
  it("serves the document for every route of the app, revalidated each time", async () => {
    for (const path of ["/", "/dashboard", "/auth/signin"]) {
      const response = await app.request(path);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<title>Cuervo</title>");
      expect(response.headers.get("cache-control")).toBe("no-cache");
    }
  });

  it("caches a hashed asset for good, and the service worker not at all", async () => {
    const asset = await app.request("/assets/index-abc123.js");

    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect((await app.request("/sw.js")).headers.get("cache-control")).toBe("no-cache");
  });

  it("answers a missing asset with a 404, not the document", async () => {
    expect((await app.request("/assets/missing.js")).status).toBe(404);
  });

  it("leaves the API to the API", async () => {
    const prelogin = await app.request("/v1/auth/prelogin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com" }),
    });

    expect(prelogin.status).toBe(200);
    expect((await app.request("/v1/no-such-route")).status).toBe(404);
  });

  it("never serves a file from outside its directory", async () => {
    const name = `secret-${directory.split("-").at(-1)}.txt`;

    for (const path of [`/../${name}`, `/%2e%2e/${name}`, `/assets/..%2f..%2f${name}`]) {
      expect(await (await app.request(path)).text()).not.toBe("secret");
    }
  });
});
