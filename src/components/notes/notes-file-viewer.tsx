import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Clock3, FileText, FolderOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type {
  NotesDirectoryEntry,
  NotesDocumentMode,
  NotesHierarchyLocation,
} from "@/components/notes/types"

type NotesFileViewerProps = {
  entries: NotesDirectoryEntry[]
  activeDocumentId: string | null
  activeCreatedMode: NotesDocumentMode
  activeLocation: NotesHierarchyLocation
  isStorageReady: boolean
  isBusy: boolean
  onOpenDocument: (documentId: string) => void
  onCreateOrOpenLocation: (location: NotesHierarchyLocation) => void
  onSaveNow: () => void
}

type NestGroup = {
  name: string
  key: string
  feathers: NotesDirectoryEntry[]
}

type BranchGroup = {
  name: string
  key: string
  nests: NestGroup[]
}

type FlightGroup = {
  name: string
  key: string
  branches: BranchGroup[]
}

type WingGroup = {
  name: string
  key: string
  flights: FlightGroup[]
}

function formatPath(location: NotesHierarchyLocation) {
  return [location.wing, location.flight, location.branch, location.nest, location.feather].join(" / ")
}

function formatUpdatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}

function buildTree(entries: NotesDirectoryEntry[]): WingGroup[] {
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

export function NotesFileViewer({
  entries,
  activeDocumentId,
  activeCreatedMode,
  activeLocation,
  isStorageReady,
  isBusy,
  onOpenDocument,
  onCreateOrOpenLocation,
  onSaveNow,
}: NotesFileViewerProps) {
  const [draftLocation, setDraftLocation] = useState<NotesHierarchyLocation>(activeLocation)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    setDraftLocation(activeLocation)
  }, [activeLocation])

  const tree = useMemo(() => {
    return buildTree(entries)
  }, [entries])

  const activePathKeys = useMemo(() => {
    const wingKey = `wing:${activeLocation.wing}`
    const flightKey = `${wingKey}/flight:${activeLocation.flight}`
    const branchKey = `${flightKey}/branch:${activeLocation.branch}`
    const nestKey = `${branchKey}/nest:${activeLocation.nest}`

    return [wingKey, flightKey, branchKey, nestKey]
  }, [activeLocation])

  useEffect(() => {
    setExpandedKeys((current) => {
      const next = new Set(current)

      for (const key of activePathKeys) {
        next.add(key)
      }

      return next
    })
  }, [activePathKeys])

  const setGroupExpanded = (groupKey: string, isExpanded: boolean) => {
    setExpandedKeys((current) => {
      const next = new Set(current)

      if (isExpanded) {
        next.add(groupKey)
      } else {
        next.delete(groupKey)
      }

      return next
    })
  }

  const renderGroupTrigger = ({
    groupKey,
    label,
    depth,
    itemCount,
  }: {
    groupKey: string
    label: string
    depth: number
    itemCount: number
  }) => {
    const isExpanded = expandedKeys.has(groupKey)

    return (
      <CollapsibleTrigger
        className="flex min-h-8 w-full items-center gap-2 rounded-md border border-border/70 bg-background/70 pr-2 text-left text-xs font-medium transition-colors hover:bg-muted/60"
        style={{ paddingLeft: `${0.55 + depth * 0.8}rem` }}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "rotate-90"
          )}
        />
        <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
        <span className="ml-auto text-[0.66rem] text-muted-foreground">{itemCount}</span>
      </CollapsibleTrigger>
    )
  }

  return (
    <aside className="sticky top-4 max-[960px]:static" aria-label="Notes file viewer">
      <Card className="max-h-[calc(100svh-8rem)] max-[960px]:max-h-none" size="sm">
        <CardHeader>
          <CardTitle>File Viewer</CardTitle>
          <CardDescription>
            Open notes by Wing / Flight / Branch / Nest / Feather and save in the selected location.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Current path: {formatPath(activeLocation)} | Created for: {activeCreatedMode}
          </p>

          <div className="grid grid-cols-2 gap-2.5 max-[640px]:grid-cols-1">
            <div className="grid gap-1">
              <Label htmlFor="wing">Wing</Label>
              <Input
                id="wing"
                value={draftLocation.wing}
                onChange={(event) => {
                  setDraftLocation((current) => ({
                    ...current,
                    wing: event.currentTarget.value,
                  }))
                }}
                placeholder="My Wing"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="flight">Flight</Label>
              <Input
                id="flight"
                value={draftLocation.flight}
                onChange={(event) => {
                  setDraftLocation((current) => ({
                    ...current,
                    flight: event.currentTarget.value,
                  }))
                }}
                placeholder="Spring 2026"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="branch">Branch</Label>
              <Input
                id="branch"
                value={draftLocation.branch}
                onChange={(event) => {
                  setDraftLocation((current) => ({
                    ...current,
                    branch: event.currentTarget.value,
                  }))
                }}
                placeholder="Biology 101"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="nest">Nest</Label>
              <Input
                id="nest"
                value={draftLocation.nest}
                onChange={(event) => {
                  setDraftLocation((current) => ({
                    ...current,
                    nest: event.currentTarget.value,
                  }))
                }}
                placeholder="Unit 4"
              />
            </div>
            <div className="col-span-2 grid gap-1 max-[640px]:col-span-1">
              <Label htmlFor="feather">Feather (Note Name)</Label>
              <Input
                id="feather"
                value={draftLocation.feather}
                onChange={(event) => {
                  setDraftLocation((current) => ({
                    ...current,
                    feather: event.currentTarget.value,
                  }))
                }}
                placeholder="Exam review"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 max-[960px]:grid-cols-1">
            <Button
              type="button"
              variant="default"
              onClick={() => {
                onCreateOrOpenLocation(draftLocation)
              }}
              disabled={!isStorageReady || isBusy}
            >
              Open or Create Path
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onSaveNow}
              disabled={!isStorageReady || isBusy}
            >
              Save Active Note
            </Button>
          </div>

          <Separator />

          <div
            className="grid max-h-[min(46svh,26rem)] gap-1.5 overflow-auto pr-1"
            role="list"
            aria-label="Saved notes"
          >
            {tree.length ? (
              tree.map((wingGroup) => {
                const isWingExpanded = expandedKeys.has(wingGroup.key)

                return (
                  <Collapsible
                    key={wingGroup.key}
                    open={isWingExpanded}
                    onOpenChange={(nextOpen) => {
                      setGroupExpanded(wingGroup.key, nextOpen)
                    }}
                    className="space-y-1"
                    role="listitem"
                  >
                    {renderGroupTrigger({
                      groupKey: wingGroup.key,
                      label: wingGroup.name,
                      depth: 0,
                      itemCount: wingGroup.flights.length,
                    })}
                    <CollapsibleContent className="space-y-1">
                      {wingGroup.flights.map((flightGroup) => {
                        const isFlightExpanded = expandedKeys.has(flightGroup.key)

                        return (
                          <Collapsible
                            key={flightGroup.key}
                            open={isFlightExpanded}
                            onOpenChange={(nextOpen) => {
                              setGroupExpanded(flightGroup.key, nextOpen)
                            }}
                            className="space-y-1"
                          >
                            {renderGroupTrigger({
                              groupKey: flightGroup.key,
                              label: flightGroup.name,
                              depth: 1,
                              itemCount: flightGroup.branches.length,
                            })}
                            <CollapsibleContent className="space-y-1">
                              {flightGroup.branches.map((branchGroup) => {
                                const isBranchExpanded = expandedKeys.has(branchGroup.key)

                                return (
                                  <Collapsible
                                    key={branchGroup.key}
                                    open={isBranchExpanded}
                                    onOpenChange={(nextOpen) => {
                                      setGroupExpanded(branchGroup.key, nextOpen)
                                    }}
                                    className="space-y-1"
                                  >
                                    {renderGroupTrigger({
                                      groupKey: branchGroup.key,
                                      label: branchGroup.name,
                                      depth: 2,
                                      itemCount: branchGroup.nests.length,
                                    })}
                                    <CollapsibleContent className="space-y-1">
                                      {branchGroup.nests.map((nestGroup) => {
                                        const isNestExpanded = expandedKeys.has(nestGroup.key)

                                        return (
                                          <Collapsible
                                            key={nestGroup.key}
                                            open={isNestExpanded}
                                            onOpenChange={(nextOpen) => {
                                              setGroupExpanded(nestGroup.key, nextOpen)
                                            }}
                                            className="space-y-1"
                                          >
                                            {renderGroupTrigger({
                                              groupKey: nestGroup.key,
                                              label: nestGroup.name,
                                              depth: 3,
                                              itemCount: nestGroup.feathers.length,
                                            })}
                                            <CollapsibleContent className="space-y-1">
                                              {nestGroup.feathers.map((entry) => {
                                                const isActive = activeDocumentId === entry.id

                                                return (
                                                  <button
                                                    key={entry.id}
                                                    type="button"
                                                    className={cn(
                                                      "grid w-full gap-1 rounded-md border border-border/70 bg-background/70 px-2 py-2 text-left transition-colors hover:bg-muted/60",
                                                      isActive && "border-primary/60 bg-primary/5"
                                                    )}
                                                    style={{ paddingLeft: `${0.55 + 4 * 0.8}rem` }}
                                                    onClick={() => {
                                                      onOpenDocument(entry.id)
                                                    }}
                                                    disabled={isBusy}
                                                  >
                                                    <span className="flex items-center gap-2 text-xs font-medium">
                                                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                                                      <span className="truncate">{entry.feather}</span>
                                                      <span className="ml-auto rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.08em] text-muted-foreground">
                                                        {entry.createdMode}
                                                      </span>
                                                    </span>
                                                    <span className="truncate text-[0.68rem] text-muted-foreground">
                                                      {formatPath(entry)}
                                                    </span>
                                                    <span className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
                                                      <Clock3 className="size-3" />
                                                      Updated {formatUpdatedAt(entry.updatedAt)}
                                                    </span>
                                                  </button>
                                                )
                                              })}
                                            </CollapsibleContent>
                                          </Collapsible>
                                        )
                                      })}
                                    </CollapsibleContent>
                                  </Collapsible>
                                )
                              })}
                            </CollapsibleContent>
                          </Collapsible>
                        )
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })
            ) : (
              <p className="text-xs text-muted-foreground">No notes saved yet for this workspace.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}
