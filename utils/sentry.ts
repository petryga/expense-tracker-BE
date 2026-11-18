import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import type { Request } from 'express';

// Error reporting to Sentry, off unless SENTRY_DSN is set. Sentry is a third
// party, so the same rule as the logs applies, only stricter: an event carries
// the error type, stack, method, path and request id, and nothing a user typed
// or owns. No bodies, headers, cookies, query strings, IPs, user ids, local
// variables or breadcrumbs.

// Errors that may quote stored values or SQL in their message (Sequelize
// quotes the offending value, e.g. a duplicate key). Their type is enough.
const QUOTES_DATA = /^Sequelize/;

const pathOnly = (url: string | undefined) => {
  if (!url) return undefined;
  try {
    return new URL(url, 'http://placeholder').pathname;
  } catch {
    return url.split('?')[0];
  }
};

// Every event passes through here before it leaves the process.
export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    event.request = { method: event.request.method, url: pathOnly(event.request.url) };
  }
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.server_name;
  for (const exception of event.exception?.values ?? []) {
    if (exception.type && QUOTES_DATA.test(exception.type)) exception.value = exception.type;
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  }
  return event;
};

export const sentryOptions = (dsn: string): Sentry.NodeOptions => ({
  dsn,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  // Release comes from SENTRY_RELEASE when set (the SDK reads it).
  // Collect nothing about the request or user in the first place; scrubEvent
  // below removes anything that still gets through.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  },
  includeServerName: false,
  includeLocalVariables: false,
  // Errors only: no tracesSampleRate, so no tracing; no profiling or logs.
  sendClientReports: false,
  maxBreadcrumbs: 0,
  beforeBreadcrumb: () => null,
  // Console capture would forward log text; local variables would forward data.
  integrations: (defaults) =>
    defaults.filter((i) => i.name !== 'Console' && i.name !== 'LocalVariables'),
  beforeSend: scrubEvent,
});

export const initSentry = () => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || process.env.NODE_ENV === 'test') return false;
  Sentry.init(sentryOptions(dsn));
  return true;
};

// The route pattern (/expenses/:id), not the path with ids in it.
export const routeOf = (req: Request | undefined) =>
  req?.route ? `${req.baseUrl}${req.route.path}` : undefined;

// Called by the error handlers for 5xx errors. A no-op when Sentry is off.
export const reportError = (error: unknown, requestId: string, route: string | undefined) => {
  Sentry.withScope((scope) => {
    scope.setTag('request_id', requestId);
    if (route) scope.setTag('route', route);
    Sentry.captureException(error);
  });
};
