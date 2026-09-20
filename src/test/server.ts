import { setupServer } from "msw/node";

// Shared MSW server. Add request handlers per test with `server.use(...)`.
export const server = setupServer();
