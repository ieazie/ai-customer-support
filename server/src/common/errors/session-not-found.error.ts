import { BaseError } from './base.error';

export class SessionNotFoundError extends BaseError {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found`);
  }
}