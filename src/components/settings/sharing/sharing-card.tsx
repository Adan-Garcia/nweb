import { ShareEntryRow } from "@/components/settings/sharing/share-entry-row";
import { ShareForm } from "@/components/settings/sharing/share-form";
import type { ShareEntry } from "@/components/settings/sharing/use-sharing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KIND_LABELS, type Shareable } from "@/lib/keys/shareable";

type SharingCardProps = {
  isConnected: boolean;
  shareable: Shareable[];
  shares: ShareEntry[];
  selected: string | null;
  error: string | null;
  isWorking: boolean;
  onSelect: (keyId: string | null) => void;
  onShare: (keyId: string, email: string, role: "reader" | "writer") => void;
  onRevoke: (keyId: string, email: string) => void;
};

/**
 * Sharing at whatever level someone actually means: a course, a tag, or one note.
 *
 * It is a flat list rather than a tree on purpose. Sharing is not a level in the hierarchy —
 * it is any object that has a key of its own — and a tag is shareable exactly as a course
 * is, even though one contains the other.
 */
export function SharingCard({
  isConnected,
  shareable,
  shares,
  selected,
  error,
  isWorking,
  onSelect,
  onShare,
  onRevoke,
}: SharingCardProps) {
  const chosen = shareable.find((thing) => thing.keyId === selected) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sharing</CardTitle>
        <CardDescription>
          {isConnected
            ? "Hand over a course, a tag, or a single note. What travels is a key sealed against the other person's — the server stores it and cannot open it."
            : "Sharing needs an account, because there has to be somebody to share with and a key to seal it for them."}
        </CardDescription>
      </CardHeader>

      {isConnected ? (
        <CardContent className="grid gap-4">
          {shareable.length ? (
            <ul className="m-0 grid list-none gap-1 p-0">
              {shareable.map((thing) => (
                <li key={thing.keyId}>
                  <Button
                    type="button"
                    size="sm"
                    variant={thing.keyId === selected ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    aria-pressed={thing.keyId === selected}
                    onClick={() => {
                      onSelect(thing.keyId === selected ? null : thing.keyId);
                    }}
                  >
                    <span className="text-muted-foreground">{KIND_LABELS[thing.kind]}</span>
                    <span>{thing.name}</span>
                    {thing.within ? (
                      <span className="text-muted-foreground">in {thing.within}</span>
                    ) : null}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">
              Nothing here has a key of its own yet. Courses and notes made from now on will.
            </p>
          )}

          {chosen ? (
            <div className="grid gap-3">
              <p className="m-0 text-sm">
                Sharing <strong>{chosen.name}</strong>.{" "}
                {chosen.kind === "feather"
                  ? "They see where it lives — its course, term and tags, by name — and nothing else in them."
                  : "Everything inside it comes too, now and later. Above it they see only the names on the way down."}
              </p>

              <ShareForm
                isDisabled={isWorking}
                onSubmit={(email, role) => {
                  onShare(chosen.keyId, email, role);
                }}
              />

              {shares.length ? (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {shares.map((entry) => (
                    <ShareEntryRow
                      key={entry.email}
                      entry={entry}
                      isDisabled={isWorking}
                      onChangeRole={(role) => {
                        onShare(chosen.keyId, entry.email, role);
                      }}
                      onRevoke={() => {
                        onRevoke(chosen.keyId, entry.email);
                      }}
                    />
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm text-muted-foreground">Nobody else has this.</p>
              )}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <p className="m-0 text-sm text-muted-foreground">
            Removing someone stops them seeing anything that happens next: the key is replaced and
            the content written back under the new one. It cannot unsee what they already read, or
            take back a copy they kept. Nothing can.
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
