import {
    OnGatewayConnection,
    OnGatewayDisconnect, OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

import { SpeechToTextService } from '../speech-to-text/speech-to-text.service';
import { TextToSpeechService } from '../text-to-speech/text-to-speech.service';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { InteractionService } from '../analytics/interaction.service';
import { DisconnectedError } from '../../common/errors/disconnected.error';
import { InactiveSessionError } from '../../common/errors/inactive-session.error';
import { AudioChunkDto } from './interfaces/AudioChunk';

import { TranscriptionResult } from '../speech-to-text/interfaces/TransacriptionResult';
import { AiResponse } from '../ai-agent/interfaces/AiResponse';
import { SessionManagerService } from '../session/session-manager.service';
import { SessionStateMachine } from '../session/session-state.machine';
import { ErrorType, SessionState } from '../session/session.enums';
import { Session, SessionContext } from '../session/session.interface';
import { SpeechToTextTranscriptionError } from '../../common/errors/speech-to-text-transcription.error';
import { AiProcessingError } from '../../common/errors/ai-processing.error';
import { TextToSpeechSynthesisError } from '../../common/errors/text-to-speech-synthesis.error';

@WebSocketGateway({
    path: '/voice-support',
    pingTimeout: 60000,
    pingInterval: 25000,
})
export class CallHandlerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private readonly logger = new Logger(CallHandlerGateway.name);
    private MAX_RETRIES: 3;
    private SESSION_EXPIRY = 30 * 60 * 1000;

    constructor(
        private speechToTextService: SpeechToTextService,
        private textToSpeechService: TextToSpeechService,
        private aiAgentService: AiAgentService,
        private readonly sessionManager: SessionManagerService,
        private readonly stateMachine: SessionStateMachine,
        private interactionService: InteractionService,
    ) {}

    afterInit(server: any): any {
        this.logger.log('CallHandlerGateway initialized');
    }

    async handleConnection(client: Socket) {
        try {
            const { sessionId, clientId } = client.handshake.query;
            console.log(JSON.stringify(sessionId as string));
            const _sessionId = `ssid_${clientId as string}`;
            console.log('ClientId returned from client:', clientId);
            console.log('SessionId returned from client:', sessionId);
            // console.log('SessionId expiry returned from client:', expires);
            if (this.sessionManager.getSession(_sessionId)) {
                const sessionId = this.sessionManager.getSession(_sessionId).id;
                // if(sessionId === _sessionId) {
                    // Active session found - resume
                    clearTimeout(this.sessionManager.getSessionTimeouts(_sessionId));
                    // this.sessionManager.deleteSessionTimeouts(_sessionId);
                    this.sessionManager.setSessionTimeouts(_sessionId, setTimeout(async () => {
                        this.sessionManager.deleteSessionTimeouts(_sessionId);
                    }, this.SESSION_EXPIRY));
                    // client.emit('session_restored', { id: sessionId });
                client.emit('session_restored', sessionId );

                return;
                // }
            }


            this.logger.log(`Client Handshake Query ${JSON.stringify(client.handshake.query)}`);
            const sampleRate = this.validateClientConfig(client.handshake.query);
            const newSessionId = `ssid_${client.handshake.query.clientId as string}`;


            this.sessionManager.createSession(newSessionId, {}, client);
            this.sessionManager.setSessionTimeouts(newSessionId, setTimeout(async () => {
                this.sessionManager.deleteSessionTimeouts(newSessionId);
            }, this.SESSION_EXPIRY));

            // Initialize SpeechToText session
            await this.speechToTextService.startSession(newSessionId, sampleRate);
            // client.emit('session_ready', { sessionId: newSessionId });
            client.emit('session_ready', newSessionId );
        } catch (error) {
            this.logger.error(`Connection error: ${error.message}`);
            client.disconnect(true);
        }
    }

    async handleDisconnect(client: Socket) {
        const _sessionId = `ssid_${client.handshake.query.sessionId as string}`;
        const session = this.findSessionByClientId(_sessionId);
        if (session) {
            this.sessionManager.setSessionTimeouts(session.id, setTimeout(async () => {
                await this.cleanupSession(session.id);
            }, this.SESSION_EXPIRY));
            this.logger.log(`Session terminated: ${session.id}`);
        }
    }

    @SubscribeMessage('audio_chunk')
    async handleAudioChunk(client: Socket, data: AudioChunkDto) {
        const _sessionId = `ssid_${client.handshake.query.sessionId as string}`;
        const session = this.sessionManager.getSession(_sessionId);
        session.lastActive = new Date();

        try {
            // Process audio chunk
            const transcription = await this.speechToTextService.transcribeAudio(
                session.id,
                data.chunk
            );

            // Handle partial results
            if (transcription.text && !transcription.isFinal) {
                client.emit('partial_transcript', {
                    text: transcription.text,
                    confidence: transcription.confidence
                });
            }

            // Handle final transcript
            if (transcription.isFinal) {
                const aiResponse = await this.processFullUtterance(session, transcription);
                await this.sendAudioResponse(client, aiResponse);
            }

        } catch (error) {
            await this.handleProcessingError(client, session, error);
        }
    }

    @SubscribeMessage('end_call')
    async handleEndCall(client: Socket) {
        const _sessionId = `ssid_${client.handshake.query.sessionId as string}`;
        const session = await this.validateSession(_sessionId);
        try {
            const finalResult = await this.speechToTextService.finalizeSession(session.id);
            if (finalResult) {
                const aiResponse = await this.processFullUtterance(session, finalResult);
                await this.sendAudioResponse(client, aiResponse);
            }
            client.emit('call_ended');
        } catch (error) {
            await this.handleProcessingError(client, session, error);
        }
    }


    private async processFullUtterance(session: Session, transcription: TranscriptionResult) {
        // Update conversation history
        session.context = await this.updateConversationContext(
            session.context,
            transcription.text,
            transcription
        );

        // Get AI response
        const aiResponse = await this.aiAgentService.processTranscription(
            transcription,
            session
        );

        // Update context with AI response
        session.context = <SessionContext>aiResponse.contextUpdates;

        return aiResponse;
    }

    private async sendAudioResponse(client: Socket, response: AiResponse) {
        try {
            const _sessionId = `ssid_${client.handshake.query.sessionId as string}`;
            const session = await this.validateSession(_sessionId);

            // Convert text to speech
            const audioResponse = await this.textToSpeechService.synthesizeSpeech(
                response.text,
                session.context.sampleRate,
                response.voicePreferences
            );

            // Send audio response
            client.emit('audio_response', {
                type: 'audio_response',
                audio: audioResponse.audio.toString('base64'),
                format: audioResponse.format
            });


        } catch (error) {
            this.logger.error(`Response generation failed: ${error.message}`);
            client.emit('processing_error', {
                code: 'RESPONSE_FAILURE',
                message: 'Failed to generate response'
            });
        }
    }


    private validateClientConfig(query: any): number {
        const sampleRate = Number(query.sampleRate);

        if (!sampleRate || isNaN(sampleRate)) {
            throw new Error('Missing or invalid sample rate');
        }

        if (![8000, 16000, 22050, 44100, 48000].includes(sampleRate)) {
            throw new Error(`Unsupported sample rate: ${sampleRate}Hz`);
        }

        return sampleRate;
    }

    private async updateConversationContext(
        context: SessionContext,
        text: string,
        transcription: TranscriptionResult
    ): Promise<SessionContext> {
        return {
            ...context,
            conversationHistory: [
                ...context.conversationHistory,
                {
                    source: 'user',
                    text,
                    timestamp: new Date(),
                    sentiment: transcription.sentiment.score
                }
            ]
        };
    }

    private async validateSession(sessionId: string): Promise<Session> {
        const session = this.sessionManager.getSession(sessionId);

        if (!session) {
            throw new DisconnectedError('Session not found');
        }

        // Fixed time calculation
        const inactiveDuration = Date.now() - session.lastActive.getTime();

        if (inactiveDuration > 30_000) { // 30 seconds
            // Remove circular call
            this.sessionManager.closeSession(session.id);
            await this.interactionService.finalizeSession(session.id);
            throw new InactiveSessionError('Session expired due to inactivity');
        }

        return session;
    }

    private async cleanupSession(sessionId: string): Promise<void> {
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
            this.sessionManager.closeSession(sessionId);
            this.sessionManager.getSessionTimeouts(sessionId);
            await this.interactionService.finalizeSession(sessionId);
        }
    }

    private findSessionByClientId(sessionId: string): Session | undefined {
        return this.sessionManager.getSession(sessionId);
    }

    private async handleProcessingError(client:Socket, session: Session, error: Error) {
        const errorType = this.classifyError(error);
        session.context.retryCount++;

        const newState = this.stateMachine.transition(session.context.state, errorType);
        this.sessionManager.updateSessionState(session.id, newState);

        if(newState === SessionState.PENDING_HANDOFF) {
            // TO BE Implemented
            await this.initiateHandoff(session);
        } else {
            client.emit('error', { code: errorType, retriesLeft: this.MAX_RETRIES - session.context.retryCount });
        }
    }

    private async initiateHandoff(session: Session) {
      try{
          // 1. Update session state
          this.sessionManager.updateSessionState(session.id, SessionState.HANDOFF_IN_PROGRESS);

          // 2. Notify client
          session.client.emit('handoff_initiated', {
              message: 'Connecting you to a support specialist...',
              positionInQueue: await this.getQueuePosition(session.id)
          });

          // 3. Create a support ticket (TBI)

          // 4. Notify support team (TBI)

          // 5. Log handoff initiation
          this.logger.log(`Handoff initiated for session: ${session.id}`);

          // 6. Close session
          this.sessionManager.closeSession(session.id);
      } catch (error){
            this.logger.error(`Handoff initiation failed: ${error.message}`);
            session.client.emit('handoff_failed');
      }
    }

    private calculateHandoffPriority(session: Session): number {
        const sentimentScore = session.context.conversationHistory
          .reduce((sum, turn) => sum + turn.sentiment, 0);

        return session.context.retryCount * 10 + Math.abs(sentimentScore);
    }

    private classifyError(error: Error): ErrorType {
        if(error instanceof SpeechToTextTranscriptionError){
            return 'STT_FAILURE';
        }

        if (error instanceof AiProcessingError) {
            return 'AI_FAILURE';
        }

        if (error instanceof TextToSpeechSynthesisError) {
            return 'TTS_FAILURE';
        }

        if (this.isNetworkError(error)) {
            return 'NETWORK_FAILURE';
        }

        if (error.message.includes('timeout') || error.message.includes('timed out')) {
            return 'TIMEOUT';
        }

        if (error.message.includes('auth') || error.message.includes('credentials')) {
            return 'AUTH_FAILURE';
        }

        return 'NETWORK_FAILURE';
    }

    private isNetworkError(error: Error): boolean {
        const networkErrorMessages = [
            'ECONNREFUSED',
            'ECONNRESET',
            'ETIMEDOUT',
            'ENOTFOUND',
            'network error',
            'socket hang up'
        ];

        return networkErrorMessages.some(msg =>
          error.message.includes(msg) ||
          error.stack?.includes(msg)
        );
    }

    private async getQueuePosition(id: string) {
        
    }
}