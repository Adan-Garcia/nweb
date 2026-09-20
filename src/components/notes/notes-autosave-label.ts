export function getAutoSaveLabel({
  isStorageReady,
  activeDocumentId,
  isHydratingDocument,
  lastSavedAt,
}: {
  isStorageReady: boolean;
  activeDocumentId: string | null;
  isHydratingDocument: boolean;
  lastSavedAt: number | null;
}): string {
  if (!isStorageReady || !activeDocumentId) {
    return "Autosave unavailable";
  }

  if (isHydratingDocument) {
    return "Autosave paused while loading";
  }

  if (!lastSavedAt) {
    return "Autosave enabled";
  }

  return `Autosaved at ${new Date(lastSavedAt).toLocaleTimeString()}`;
}
