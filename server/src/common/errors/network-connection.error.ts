import { BaseError } from './base.error';

export class NetworkConnectionError extends BaseError {
  constructor(message: string, public readonly endpoint?: string) {
    super(message);
    this.name = 'NetworkConnectionError';
  }
}