import { BaseError } from './base.error';

export class TextToSpeechSynthesisError extends BaseError {
  constructor(message: string, public readonly text?: string) {
    super(message);
    this.name = 'TextToSpeechSynthesisError';
  }
}