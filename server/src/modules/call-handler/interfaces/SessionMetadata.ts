export interface SessionMetadata {
    sessionStart: Date;
    protocolVersion: string;
    codec: 'opus' | 'pcm';
    bufferSize: number;
}