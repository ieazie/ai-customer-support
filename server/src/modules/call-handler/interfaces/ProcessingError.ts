export interface ProcessingError {
    code: 'AUTH_FAILURE' | 'SESSION_INVALID' | 'TRANSCRIPTION_FAILURE';
    message: string;
    fatal: boolean;
}