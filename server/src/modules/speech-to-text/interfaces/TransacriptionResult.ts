import {SentimentAnalysis} from "../../../common/interfaces/SentimentAnalysis";
import {WordLevelMeta} from "./WordLevelMeta";

export interface TranscriptionResult {
    text: string;
    isFinal: boolean;
    confidence: number;
    sentiment?: SentimentAnalysis;
    words?: WordLevelMeta[];

}