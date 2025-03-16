import { BaseError } from './base.error';

export class InactiveSessionError extends BaseError {
    constructor(message: string) {
        super(message);
    }
}