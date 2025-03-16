import { BaseError } from './base.error';

export class SpeechToTextTranscriptionError extends BaseError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'SpeechToTextTranscriptionError';
  }
}