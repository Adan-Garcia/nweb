// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isPublicAddress, NOT_PUBLIC, publicOnlyLookup, type Resolve } from "./public-address";

describe("isPublicAddress", () => {
  it.each([
    "169.254.169.254",
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.5",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "not an address",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["142.250.72.14", "2607:f8b0:4005:80a::200e", "::ffff:142.250.72.14"])(
    "allows %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

/** A resolver that answers every name with these addresses. */
function resolvingTo(...addresses: string[]): Resolve {
  return (_hostname, _options, callback) => {
    callback(
      null,
      addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
    );
  };
}

function ask(resolve: Resolve, all = false) {
  return new Promise<{ error: NodeJS.ErrnoException | null; address: unknown }>((done) => {
    publicOnlyLookup(resolve)("push.example", { all }, (error, address) => {
      done({ error, address });
    });
  });
}

describe("publicOnlyLookup", () => {
  it("refuses a public name that resolves into a private network", async () => {
    const { error } = await ask(resolvingTo("169.254.169.254"));

    expect(error?.code).toBe(NOT_PUBLIC);
  });

  it("refuses when any one of the addresses is private, since a connection may fall back", async () => {
    const { error } = await ask(resolvingTo("142.250.72.14", "10.0.0.5"), true);

    expect(error?.code).toBe(NOT_PUBLIC);
  });

  it("passes a public answer on, in the shape that was asked for", async () => {
    expect(await ask(resolvingTo("142.250.72.14"))).toEqual({
      error: null,
      address: "142.250.72.14",
    });
    expect((await ask(resolvingTo("142.250.72.14"), true)).address).toEqual([
      { address: "142.250.72.14", family: 4 },
    ]);
  });

  it("passes a resolver's own failure through", async () => {
    const failing: Resolve = (_hostname, _options, callback) => {
      callback(Object.assign(new Error("not found"), { code: "ENOTFOUND" }), []);
    };

    expect((await ask(failing)).error?.code).toBe("ENOTFOUND");
  });

  it("uses the system's own resolver by default, and refuses what it says is local", async () => {
    const error = await new Promise<NodeJS.ErrnoException | null>((done) => {
      publicOnlyLookup()("localhost", {}, (failure) => {
        done(failure);
      });
    });

    expect(error?.code).toBe(NOT_PUBLIC);
  });
});
