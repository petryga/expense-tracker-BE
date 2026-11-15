// Who may import what (PLANS.md, "Two environments").
//
// - Local (AUTH_DISABLED=true, every request is the null user): real use, file
//   upload on.
// - Production: a public demo. The demo user can never upload a file, only load
//   the bundled synthetic sample. Upload for any other account stays behind
//   STATEMENT_UPLOAD_ENABLED, off by default.
export const isDemoUser = (userId: string | null) =>
  !!process.env.DEMO_USER_ID && userId === process.env.DEMO_USER_ID;

export const canUploadStatements = (userId: string | null) =>
  !isDemoUser(userId) &&
  (process.env.AUTH_DISABLED === 'true' || process.env.STATEMENT_UPLOAD_ENABLED === 'true');

export const canImportSample = (userId: string | null) => isDemoUser(userId);
