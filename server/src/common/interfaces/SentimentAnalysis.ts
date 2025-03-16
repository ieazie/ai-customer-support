export interface SentimentAnalysis {
    score: number; // -1 (negative) to 1 (positive)
    magnitude?: number; // 0-∞ (strength of emotion)
    label: 'positive' | 'neutral' | 'negative';
}