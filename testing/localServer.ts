import type { Express } from 'express';
import type { Server } from 'node:http';
import { onTestFinished } from 'vitest';

// Tests send requests to a server listening on 127.0.0.1 only. Passing a bare
// app to supertest starts a new server for every request, on a fresh port on
// all interfaces; on macOS another process can already hold that port on
// 127.0.0.1, and the request then lands there (a stray 404, an empty body or
// someone else's 200). Supertest reuses a server that is already listening and
// connects to 127.0.0.1, so requests reach this one.
export const listenLocal = (app: Express) =>
  new Promise<Server>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });

export const stopServer = (server: Server) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

// For one test: the server closes when the test ends.
export const serve = async (app: Express) => {
  const server = await listenLocal(app);
  onTestFinished(() => stopServer(server));
  return server;
};
