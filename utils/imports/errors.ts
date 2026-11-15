import type { ParseError } from '../statementParsers/types.js';

// Bad input from the user (file or decisions): routes answer 400 with details.
export class ImportInputError extends Error {
  constructor(
    message: string,
    readonly details?: ParseError[],
  ) {
    super(message);
    this.name = 'ImportInputError';
  }
}

// Unknown id, or another user's import: routes answer 404.
export class ImportNotFoundError extends Error {
  constructor() {
    super('Import not found');
    this.name = 'ImportNotFoundError';
  }
}
