import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssemblyAI } from 'assemblyai';


import {TranscriptionResult} from "./interfaces/TransacriptionResult";
import {SentimentAnalysis} from "../../common/interfaces/SentimentAnalysis";
import {TranscriptionSession} from "./interfaces/TranscriptionSession";
import { SpeechToTextTranscriptionError } from '../../common/errors/speech-to-text-transcription.error';

@Injectable()
export class SpeechToTextService {
    private readonly logger = new Logger(SpeechToTextService.name);
    private readonly client: AssemblyAI;
    private sessions = new Map<string, TranscriptionSession>();

    constructor(private readonly configService: ConfigService) {
        this.client = new AssemblyAI({
            apiKey: this.configService.get<string>('ASSEMBLYAI_API_KEY')!,
        });
    }

    async startSession(sessionId: string, sampleRate: number): Promise<void> {
        try {
            const transcriber = this.client.realtime.transcriber({
                sampleRate,
                wordBoost: ['technical', 'support', 'error'],
            });
            this.logger.log(`Starting new transcription session [${sessionId}]`);

            transcriber.on('transcript', (transcript: any) => {
                const session = this.sessions.get(sessionId);
                if (!session) return;

                if (transcript.partial) {
                    session.partialText = transcript.text;
                } else {
                    session.finalText = transcript.text;
                    session.confidence = transcript.confidence;
                    session.words = (transcript.words || []).map((w: any) => ({
                        word: w.text,
                        start: w.start,
                        end: w.end,
                        confidence: w.confidence,
                    }));
                }
            });

            transcriber.on('error', (error: Error) => {
                this.logger.error(`SpeechToText Error [${sessionId}]: ${error.message}`);
                this.cleanupSession(sessionId);
            });

            transcriber.on('close', () => {
                this.cleanupSession(sessionId);
            });

            await transcriber.connect();

            this.sessions.set(sessionId, {
                transcriber,
                partialText: '',
                finalText: '',
                confidence: 0,
                words: [],
            });
        } catch (error) {
            this.logger.error(`Session start failed: ${error.message}`);
            throw error;
        }
    }

    async transcribeAudio(sessionId: string, chunk: Buffer, retries = 3): Promise<TranscriptionResult> {
        const session = this.sessions.get(sessionId);
        if (!session?.transcriber) {
            throw new SpeechToTextTranscriptionError('SpeechToText session not initialized');
        }

        try {
            await session.transcriber.sendAudio(chunk);
            return this.getCurrentTranscript(sessionId);
        } catch (error) {
            if(retries > 0) {
                this.logger.warn(`Transcription retry [${sessionId}]: ${error.message}`);
                return this.transcribeAudio(sessionId, chunk, retries - 1);
            }
            this.logger.error(`Audio processing error: ${error.message}`);
            return this.emptyTranscriptionResult();
        }
    }

    async finalizeSession(sessionId: string): Promise<TranscriptionResult> {
        const session = this.sessions.get(sessionId);
        if (!session) return this.emptyTranscriptionResult();

        try {
            // Send end of stream marker
            await session.transcriber.close();

            const result = this.getCurrentTranscript(sessionId);
            result.sentiment = await this.analyzeSentiment(result.text);

            return result;
        } catch (error) {
            this.logger.error(`Session finalization error: ${error.message}`);
            return this.emptyTranscriptionResult();
        } finally {
            this.cleanupSession(sessionId);
        }
    }

    private getCurrentTranscript(sessionId: string): TranscriptionResult {
        const session = this.sessions.get(sessionId);
        if (!session) return this.emptyTranscriptionResult();

        return {
            text: session.finalText || session.partialText,
            isFinal: !!session.finalText,
            confidence: session.confidence,
            words: session.words,
        };
    }

    private async analyzeSentiment(text: string): Promise<SentimentAnalysis> {
        if (!text) return { score: 0, label: 'neutral' };

        try {
            const response = await fetch('https://api.assemblyai.com/v2/sentiment', {
                method: 'POST',
                headers: {
                    'Authorization': this.configService.get<string>('ASSEMBLYAI_API_KEY')!,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            return {
                score: data.score,
                label: data.label.toLowerCase() as 'positive' | 'neutral' | 'negative'
            };
        } catch (error) {
            this.logger.warn(`Sentiment analysis failed: ${error.message}`);
            return { score: 0, label: 'neutral' };
        }
    }


    private cleanupSession(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.transcriber.close().catch(() => {});
            this.sessions.delete(sessionId);
        }
    }

    private emptyTranscriptionResult(): TranscriptionResult {
        return {
            text: '',
            isFinal: false,
            confidence: 0,
            words: [],
        };
    }

}