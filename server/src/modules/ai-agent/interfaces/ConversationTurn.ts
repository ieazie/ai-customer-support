import {SentimentAnalysis} from "../../../common/interfaces/SentimentAnalysis";

export interface ConversationTurn {
    role: 'customer' | 'agent';
    text: string;
    timestamp: Date;
    sentiment?: SentimentAnalysis;
}