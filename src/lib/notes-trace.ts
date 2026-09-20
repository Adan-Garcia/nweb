const NOTES_TRACE_KEY = "cuervo-notes-trace";

function isTraceEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const value = window.localStorage.getItem(NOTES_TRACE_KEY);
    return value === "1" || value === "true" || value === "on";
  } catch {
    return false;
  }
}

export function notesTrace(scope: string, message: string, payload?: unknown) {
  if (!isTraceEnabled()) {
    return;
  }

  const prefix = `[notes-trace][${scope}] ${message}`;

  if (payload === undefined) {
    console.debug(prefix);
    return;
  }

  console.debug(prefix, payload);
}

export function notesTraceError(scope: string, message: string, error: unknown, payload?: unknown) {
  if (!isTraceEnabled()) {
    return;
  }

  const errorDetails =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : {
          error,
        };

  const mergedPayload =
    payload === undefined
      ? { error: errorDetails }
      : {
          ...(typeof payload === "object" && payload !== null ? payload : { payload }),
          error: errorDetails,
        };

  console.debug(`[notes-trace][${scope}] ${message}`, mergedPayload);
}

export function setNotesTraceEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (enabled) {
      window.localStorage.setItem(NOTES_TRACE_KEY, "1");
    } else {
      window.localStorage.removeItem(NOTES_TRACE_KEY);
    }
  } catch {
    return;
  }
}
