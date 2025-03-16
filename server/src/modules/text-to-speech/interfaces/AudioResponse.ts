import {WordTimestamp} from "./WordTimeStamp";

export interface AudioResponse {
    audio: Buffer;
    format: 'wav' | 'mp3' | 'ogg';
    duration: number;
    sampleRate: number;
    wordTimestamps?: WordTimestamp[];
}