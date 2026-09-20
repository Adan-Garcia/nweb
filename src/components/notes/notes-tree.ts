import type {
  NotesDirectoryEntry,
  NotesHierarchyLocation,
} from "@/components/notes/types"

export type NestGroup = {
  name: string
  key: string
  feathers: NotesDirectoryEntry[]
}

export type BranchGroup = {
  name: string
  key: string
  nests: NestGroup[]
}

export type FlightGroup = {
  name: string
  key: string
  branches: BranchGroup[]
}

export type WingGroup = {
  name: string
  key: string
  flights: FlightGroup[]
}

export function formatPath(location: NotesHierarchyLocation) {
  return [location.wing, location.flight, location.branch, location.nest, location.feather].join(" / ")
}

export function formatUpdatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}

export function buildTree(entries: NotesDirectoryEntry[]): WingGroup[] {
  const sortedEntries = [...entries].sort((left, right) => right.updatedAt - left.updatedAt)
  const wingMap = new Map<string, Map<string, Map<string, Map<string, NotesDirectoryEntry[]>>>>()

  for (const entry of sortedEntries) {
    const flightMap = wingMap.get(entry.wing) ?? new Map<string, Map<string, Map<string, NotesDirectoryEntry[]>>>()
    wingMap.set(entry.wing, flightMap)

    const branchMap = flightMap.get(entry.flight) ?? new Map<string, Map<string, NotesDirectoryEntry[]>>()
    flightMap.set(entry.flight, branchMap)

    const nestMap = branchMap.get(entry.branch) ?? new Map<string, NotesDirectoryEntry[]>()
    branchMap.set(entry.branch, nestMap)

    const feathers = nestMap.get(entry.nest) ?? []
    feathers.push(entry)
    nestMap.set(entry.nest, feathers)
  }

  const wingGroups: WingGroup[] = []

  for (const [wingName, flightMap] of wingMap.entries()) {
    const wingKey = `wing:${wingName}`
    const flightGroups: FlightGroup[] = []

    for (const [flightName, branchMap] of flightMap.entries()) {
      const flightKey = `${wingKey}/flight:${flightName}`
      const branchGroups: BranchGroup[] = []

      for (const [branchName, nestMap] of branchMap.entries()) {
        const branchKey = `${flightKey}/branch:${branchName}`
        const nestGroups: NestGroup[] = []

        for (const [nestName, feathers] of nestMap.entries()) {
          const nestKey = `${branchKey}/nest:${nestName}`
          nestGroups.push({
            name: nestName,
            key: nestKey,
            feathers,
          })
        }

        nestGroups.sort((left, right) => left.name.localeCompare(right.name))

        branchGroups.push({
          name: branchName,
          key: branchKey,
          nests: nestGroups,
        })
      }

      branchGroups.sort((left, right) => left.name.localeCompare(right.name))

      flightGroups.push({
        name: flightName,
        key: flightKey,
        branches: branchGroups,
      })
    }

    flightGroups.sort((left, right) => left.name.localeCompare(right.name))

    wingGroups.push({
      name: wingName,
      key: wingKey,
      flights: flightGroups,
    })
  }

  wingGroups.sort((left, right) => left.name.localeCompare(right.name))

  return wingGroups
}

/** Keys of the groups on the path to `location`, so they can be auto-expanded. */
export function getActivePathKeys(location: NotesHierarchyLocation) {
  const wingKey = `wing:${location.wing}`
  const flightKey = `${wingKey}/flight:${location.flight}`
  const branchKey = `${flightKey}/branch:${location.branch}`
  const nestKey = `${branchKey}/nest:${location.nest}`

  return [wingKey, flightKey, branchKey, nestKey]
}
