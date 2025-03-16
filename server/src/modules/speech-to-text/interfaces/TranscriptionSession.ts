export interface TranscriptionSession {
    transcriber: any; // AssemblyAI's realtime transcriber instance
    partialText: string;
    finalText: string;
    confidence: number;
    words: Array<{ word: string; start: number; end: number; confidence: number }>;
}