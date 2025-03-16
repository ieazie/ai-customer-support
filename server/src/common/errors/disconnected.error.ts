import { BaseError } from './base.error';

export class DisconnectedError extends BaseError {
    constructor(message: string) {
        super(message);
    }
}