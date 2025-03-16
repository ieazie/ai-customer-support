import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { InteractionService } from '../analytics/interaction.service';
import {SentimentAnalysis } from "../../common/interfaces/SentimentAnalysis";
import {VoicePreferences} from "./interfaces/VoicePreference";
import {AiResponse} from "./interfaces/AiResponse";
import { TranscriptionResult } from '../speech-to-text/interfaces/TransacriptionResult';
import { Session, SessionContext } from '../session/session.interface';
import { SessionState } from '../session/session.enums';

@Injectable()
export class AiAgentService {
    private readonly logger = new Logger(AiAgentService.name);
    private openai: OpenAI;
    private knowledgeBaseCache = new Map<string, {
        articles: string[];
        timestamp: number;
    }>();

    // Cache configuration (1 hour in milliseconds)
    private readonly CACHE_TTL = 60 * 60 * 1000;

    constructor(
        private configService: ConfigService,
        private interactionService: InteractionService
    ) {
        this.openai = new OpenAI({
            apiKey: this.configService.get('OPENAI_API_KEY'),
        });

        // Initialize periodic cache cleanup
        setInterval(() => this.cleanExpiredCacheEntries(), this.CACHE_TTL);
    }

    async processTranscription(
      transcription: TranscriptionResult,
      session: Session
    ): Promise<AiResponse> {
        try {

            if (session.context.state === SessionState.PENDING_HANDOFF) {
                return this.handoffResponse(session.context);
            }

            // Use AssemblyAI's sentiment analysis results
            const sentiment = this.normalizeSentiment(transcription.sentiment);

            // Update conversation history with full context
            const updatedContext = this.updateConversationContext(
              session.context,
              transcription
            );

            // Generate AI response
            const response = await this.generateResponse(
              transcription.text,
              updatedContext,
              sentiment
            );

            // Log interaction with actual sentiment from transcription
            await this.logInteraction(
              session,
              transcription.text,
              response,
              transcription.sentiment
            );

            return response;
        } catch (error) {
            this.logger.error(`AI Processing Error: ${error.message}`);
            return this.fallbackResponse(session.context);
        }
    }

    private handoffResponse(context: SessionContext): AiResponse {
        const handoffMessages = [
            "I'm transferring you to a human specialist who can better assist you.",
            "Let me connect you with one of our support experts.",
            "For more detailed help, I'll connect you with a customer service representative."
        ];

        return {
            text: handoffMessages[Math.floor(Math.random() * handoffMessages.length)],
            voicePreferences: {
                voice: 'female_01',
                speed: 1.0,
                pitch: 0.5,
                modulation: 0.8
            },
            contextUpdates: {
                ...context,
                systemState: {
                    ...context.systemState,
                    requiresHandoff: true,
                    handoffInitiatedAt: new Date()
                }
            }
        };
    }



    private determineVoiceParameters(sentiment: SentimentAnalysis): VoicePreferences {
        // More nuanced voice modulation based on sentiment strength
        const absScore = Math.abs(sentiment.score);

        return {
            voice: sentiment.score >= 0.3 ? 'female_02' :
              sentiment.score <= -0.3 ? 'male_01' : 'female_01',
            speed: 1.0 + (absScore * 0.4), // 0.8-1.8x speed
            pitch: (sentiment.score * 1.2), // Wider pitch variation
            modulation: absScore * 1.5 // More dramatic modulation for strong sentiments
        };
    }

    private async buildPrompt(
      text: string,
      context: SessionContext,
      sentiment: SentimentAnalysis
    ): Promise<string> {
        const knowledgeBase = this.getRelevantKnowledgeBase(text);

        return `You are a senior customer support agent.
    
                Current Context:
                - Customer Technical Level: ${context.customerMetadata?.technicalLevel || 'unknown'}
                - Previous Interactions: ${context.conversationHistory.length}
                - System Status: ${context.systemState.requiresHandoff ? 'Escalation needed' : 'Normal'}
                
                Customer Message (${sentiment.label} sentiment):
                "${text}"
                
                Detected Sentiment:
                - Strength: ${Math.abs(sentiment.score).toFixed(2)}
                - Polarity: ${sentiment.score > 0 ? 'Positive' : 'Negative'}
                
                Relevant Knowledge Base:
                ${(await knowledgeBase).join('\n- ')}
                
                Response Guidelines:
                1. First sentence should ${sentiment.label === 'negative' ? 'acknowledge and empathize' : 'confirm understanding'}
                2. Provide solution using ${context.customerMetadata?.technicalLevel || 'beginner'}-level language
                3. Keep under 2 sentences
                4. ${sentiment.score < -0.5 ? 'Suggest escalation option' : 'Offer additional help'}
                
                Response:`;
    }

    private async generateResponse(text: string, context: SessionContext, sentiment: SentimentAnalysis): Promise<AiResponse> {
        try {
            const prompt = await this.buildPrompt(text, context, sentiment);

            const completion = await this.openai.chat.completions.create({
                messages: [{ role: 'system', content: prompt }],
                model: 'gpt-4',
                temperature: 0.7,
                max_tokens: 150,
            });

            return {
                text: completion.choices[0].message.content,
                voicePreferences: this.determineVoiceParameters(sentiment),
                contextUpdates: {
                    ...context,
                    lastResponse: completion.choices[0].message.content
                }
            };
        } catch (error) {
            this.logger.error(`OpenAI API Error: ${error.message}`);
            return this.fallbackResponse(context);
        }
    }

    private cleanExpiredCacheEntries() {
        const now = Date.now();
        for (const [key, entry] of this.knowledgeBaseCache.entries()) {
            if (now - entry.timestamp > this.CACHE_TTL) {
                this.knowledgeBaseCache.delete(key);
                this.logger.debug(`Cleared expired cache entry: ${key}`);
            }
        }
    }

    private normalizeQuery(query: string): string {
        return query
          .trim()
          .toLowerCase()
          .replace(/[^\w\s]/gi, '');
    }

    private async getRelevantKnowledgeBase(query: string): Promise<string[]> {
        try {
            const cacheKey = this.normalizeQuery(query);

            // Return cached results if valid
            const cached = this.knowledgeBaseCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                this.logger.debug(`Cache hit for query: ${cacheKey}`);
                return cached.articles;
            }

            this.logger.debug(`Cache miss for query: ${cacheKey}`);

            // Simulated API call - replace with actual knowledge base integration
            const results = await this.fetchFromKnowledgeBaseAPI(query);

            // Update cache
            this.knowledgeBaseCache.set(cacheKey, {
                articles: results,
                timestamp: Date.now()
            });

            return results;
        } catch (error) {
            this.logger.error(`Knowledge base error: ${error.message}`);
            return this.getFallbackKnowledge();
        }
    }

    private async fetchFromKnowledgeBaseAPI(query: string): Promise<string[]> {
        // Simulate API call with delay
        await new Promise(resolve => setTimeout(resolve, 100));

        // Mock implementation - replace with actual API call
        return [
            'Returns policy: 30-day return window',
            'Common issue: Reset device by holding power for 10s',
            'Warranty: 1-year limited warranty'
        ];
    }

    private getFallbackKnowledge(): string[] {
        return ['Standard troubleshooting: Restart the device'];
    }


    private async logInteraction(
        session: Session,
        customerText: string,
        response: AiResponse,
        sentiment: SentimentAnalysis
    ) {
        await this.interactionService.logInteraction({
            sessionId: session.id,
            customerText,
            aiResponse: response.text,
            sentimentScore: sentiment.score,
              context: {
                  ...session.context,
                  systemState: session.context.systemState
              },
            voiceModelUsed: response.voicePreferences.voice
        });
    }

    private fallbackResponse(context: SessionContext): AiResponse {
        return {
            text: "I'm having trouble connecting to our systems. Please hold while I transfer you to a human agent.",
            voicePreferences: {
                voice: 'female_01',
                speed: 1.0,
                pitch: 0.0
            },
            contextUpdates: {
                ...context,
                needsHumanIntervention: true
            }
        };
    }

    private normalizeSentiment(sentiment?: SentimentAnalysis): SentimentAnalysis {
        if (!sentiment) {
            this.logger.warn('Using fallback neutral sentiment');
            return { score: 0, label: 'neutral' };
        }

        return {
            score: sentiment.score,
            label: sentiment.label.toLowerCase() as 'positive' | 'neutral' | 'negative'
        };
    }

    private updateConversationContext(
      context: SessionContext,
      transcription: TranscriptionResult,
    ): SessionContext {
        return {
            ...context,
            conversationHistory: [
                ...context.conversationHistory,
                {
                    source: 'user',
                    text: transcription.text,
                    sentiment: transcription.sentiment.score,
                    timestamp: new Date(),
                }
            ],
            systemState: {
                ...context.systemState,
            }
        };
    }
}