import { describe, expect, it } from "vitest"

import type { NotesDirectoryEntry } from "@/components/notes/types"
import { buildTree, formatPath, getActivePathKeys } from "./notes-tree"

function entry(
  path: [string, string, string, string, string],
  updatedAt: number,
): NotesDirectoryEntry {
  const [wing, flight, branch, nest, feather] = path
  return {
    id: path.join("/"),
    wing,
    flight,
    branch,
    nest,
    feather,
    createdMode: "linear",
    createdAt: 0,
    updatedAt,
  }
}

describe("formatPath", () => {
  it("joins the five segments with slashes", () => {
    expect(formatPath({ wing: "W", flight: "F", branch: "B", nest: "N", feather: "T" })).toBe("W / F / B / N / T")
  })
})

describe("getActivePathKeys", () => {
  it("returns cumulative group keys down to the nest", () => {
    expect(getActivePathKeys({ wing: "W", flight: "F", branch: "B", nest: "N", feather: "T" })).toEqual([
      "wing:W",
      "wing:W/flight:F",
      "wing:W/flight:F/branch:B",
      "wing:W/flight:F/branch:B/nest:N",
    ])
  })
})

describe("buildTree", () => {
  it("is empty when there are no entries", () => {
    expect(buildTree([])).toEqual([])
  })

  it("groups entries by wing, flight, branch and nest with stable keys", () => {
    const tree = buildTree([
      entry(["Home", "Fall", "Math", "Unit 1", "A"], 1),
      entry(["Home", "Fall", "Math", "Unit 1", "B"], 2),
      entry(["Home", "Fall", "Math", "Unit 2", "C"], 3),
    ])

    expect(tree).toHaveLength(1)
    const [wing] = tree
    expect(wing).toMatchObject({ name: "Home", key: "wing:Home" })
    expect(wing.flights[0]).toMatchObject({ name: "Fall", key: "wing:Home/flight:Fall" })
    const branch = wing.flights[0].branches[0]
    expect(branch.key).toBe("wing:Home/flight:Fall/branch:Math")
    expect(branch.nests.map((nest) => nest.name)).toEqual(["Unit 1", "Unit 2"])
    expect(branch.nests[0].key).toBe("wing:Home/flight:Fall/branch:Math/nest:Unit 1")
  })

  it("lists the most recently updated notes first within a nest", () => {
    const [wing] = buildTree([
      entry(["W", "F", "B", "N", "old"], 1),
      entry(["W", "F", "B", "N", "new"], 9),
    ])

    expect(wing.flights[0].branches[0].nests[0].feathers.map((note) => note.feather)).toEqual(["new", "old"])
  })

  it("sorts every level alphabetically", () => {
    const tree = buildTree([
      entry(["Zed", "F", "B", "N", "x"], 1),
      entry(["Alpha", "F2", "B", "N", "x"], 1),
      entry(["Alpha", "F1", "B2", "N", "x"], 1),
      entry(["Alpha", "F1", "B1", "N2", "x"], 1),
      entry(["Alpha", "F1", "B1", "N1", "x"], 1),
    ])

    expect(tree.map((wing) => wing.name)).toEqual(["Alpha", "Zed"])
    const [alpha] = tree
    expect(alpha.flights.map((flight) => flight.name)).toEqual(["F1", "F2"])
    expect(alpha.flights[0].branches.map((branch) => branch.name)).toEqual(["B1", "B2"])
    expect(alpha.flights[0].branches[0].nests.map((nest) => nest.name)).toEqual(["N1", "N2"])
  })

  it("does not mutate the input order", () => {
    const entries = [entry(["W", "F", "B", "N", "a"], 1), entry(["W", "F", "B", "N", "b"], 2)]
    const snapshot = entries.map((item) => item.id)
    buildTree(entries)
    expect(entries.map((item) => item.id)).toEqual(snapshot)
  })
})
