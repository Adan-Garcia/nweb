import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { writeLocalAccount } from "@/lib/account/local-account";
import { getNotesDb } from "@/lib/db/notes-db";

import { useLocalAccount } from "./use-local-account";

beforeEach(async () => {
  await (await getNotesDb()).clear("local-account");
});

describe("useLocalAccount", () => {
  it("says there is none on a new device, and sees one once it is made", async () => {
    const { result } = renderHook(() => useLocalAccount());

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("none"));
    expect(result.current.account).toBeNull();

    await writeLocalAccount({ name: "Ada", email: "ada@example.com" });
    await act(async () => {
      expect(await result.current.refresh()).toMatchObject({ name: "Ada" });
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.account?.email).toBe("ada@example.com");
  });
});
