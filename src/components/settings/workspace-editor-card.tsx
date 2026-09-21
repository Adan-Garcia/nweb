import { BranchColorPicker } from "@/components/settings/branch-color-picker";
import type { useWorkspaceEditor } from "@/components/settings/use-workspace-editor";
import { WorkspaceEntityRow } from "@/components/settings/workspace-entity-row";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { branchesForFlight, flightsForWing, nestsForBranch } from "@/lib/workspace-tree";

type WorkspaceEditorCardProps = ReturnType<typeof useWorkspaceEditor>;

/**
 * The workspace, editable. Everything above a note — wings, flights, branches, nests —
 * lives in a row of its own, so renaming one renames it everywhere at once and nothing
 * that points at it has to be rewritten. The path bar can only add; this is where the
 * other half of that storage becomes something a user can reach.
 */
export function WorkspaceEditorCard({
  snapshot,
  status,
  isWorking,
  rename,
  recolour,
  remove,
}: WorkspaceEditorCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your workspace</CardTitle>
        <CardDescription>
          Rename or delete anything above a note. A name lives in one place, so changing it here
          changes it everywhere. Deleting takes everything underneath with it, and there is no undo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {snapshot.wings.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            Nothing here yet. A wing is created for you the first time you write a note.
          </p>
        ) : null}

        {snapshot.wings.map((wing) => (
          <div key={wing.id} className="rounded-lg border border-border/70 p-3">
            <WorkspaceEntityRow
              level="wing"
              id={wing.id}
              name={wing.name}
              isDisabled={isWorking}
              onRename={(name) => void rename("wing", wing.id, name)}
              onDelete={() => void remove("wing", wing.id, wing.name)}
            />

            {flightsForWing(snapshot, wing.id).map((flight) => (
              <div key={flight.id} className="ml-4 border-l border-border/70 pl-3">
                <WorkspaceEntityRow
                  level="flight"
                  id={flight.id}
                  name={flight.name}
                  isDisabled={isWorking}
                  onRename={(name) => void rename("flight", flight.id, name)}
                  onDelete={() => void remove("flight", flight.id, flight.name)}
                />

                {branchesForFlight(snapshot, flight.id).map((branch) => (
                  <div key={branch.id} className="ml-4 border-l border-border/70 pl-3">
                    <WorkspaceEntityRow
                      level="branch"
                      id={branch.id}
                      name={branch.name}
                      isDisabled={isWorking}
                      onRename={(name) => void rename("branch", branch.id, name)}
                      onDelete={() => void remove("branch", branch.id, branch.name)}
                    >
                      <BranchColorPicker
                        branchName={branch.name}
                        color={branch.color}
                        isDisabled={isWorking}
                        onPick={(color) => void recolour(branch.id, color)}
                      />
                    </WorkspaceEntityRow>

                    {nestsForBranch(snapshot, branch.id).map((nest) => (
                      <div key={nest.id} className="ml-4 border-l border-border/70 pl-3">
                        <WorkspaceEntityRow
                          level="nest"
                          id={nest.id}
                          name={nest.name}
                          isDisabled={isWorking}
                          onRename={(name) => void rename("nest", nest.id, name)}
                          onDelete={() => void remove("nest", nest.id, nest.name)}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

        {status ? (
          <p role="status" className="m-0 text-sm text-muted-foreground">
            {status}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
