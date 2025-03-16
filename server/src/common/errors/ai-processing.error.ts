import { BaseError } from './base.error';

export class AiProcessingError extends BaseError {
  constructor(message: string, public readonly context?: any) {
    super(message);
    this.name = 'AiProcessingError';
  }
}