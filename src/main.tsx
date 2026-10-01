import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "@/lib/service-worker";
import "./index.css";
import App from "./App.tsx";

// `npm run dev:open`: a throwaway account, signed in, so the workspace pages open straight
// away. Both conditions are compile-time constants, so a production build drops this whole
// block and never bundles the module it loads.
if (import.meta.env.DEV && import.meta.env.VITE_DEV_SESSION === "1") {
  const { startDevSession } = await import("@/lib/account/dev-session");
  await startDevSession();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// After render: offline support is not worth delaying the first paint for.
void registerServiceWorker();
