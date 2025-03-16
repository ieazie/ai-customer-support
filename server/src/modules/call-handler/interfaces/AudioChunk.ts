export interface AudioChunk {
    data: Buffer;
    sequence: number;
    timestamp: number;
    isFinal: boolean;
}

export interface AudioChunkDto {
    sessionId: string;
    chunk: Buffer;
}