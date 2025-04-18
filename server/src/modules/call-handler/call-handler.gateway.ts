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
    pingTimeout: 30000,
    pingInterval: 10000,
    cors: true,
    transports: ['websocket', 'polling'],
})
export class CallHandlerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private readonly logger = new Logger(CallHandlerGateway.name);
    private MAX_RETRIES = 3;
    private SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes
    private INACTIVE_TIMEOUT = 60 * 1000; // 1 minute

    constructor(
        private speechToTextService: SpeechToTextService,
        private textToSpeechService: TextToSpeechService,
        private aiAgentService: AiAgentService,
        private readonly sessionManager: SessionManagerService,
        private readonly stateMachine: SessionStateMachine,
        private interactionService: InteractionService,
    ) {}

    afterInit(server: Server): any {
        this.logger.log('CallHandlerGateway initialized');
        
        // Set up session cleanup interval
        setInterval(() => {
            this.pruneInactiveSessions();
        }, 5 * 60 * 1000); // Run every 5 minutes
    }

    async handleConnection(client: Socket) {
        try {
            const { clientId } = client.handshake.query;
            
            if (!clientId) {
                throw new Error('Missing client ID');
            }
            
            const sessionId = `ssid_${clientId as string}`;
            
            // Check for existing session
            if (this.sessionManager.getSession(sessionId)) {
                this.logger.log(`Restoring existing session: ${sessionId}`);
                
                // Clear any existing timeout
                const existingTimeout = this.sessionManager.getSessionTimeouts(sessionId);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                }
                
                // Update client reference in the session
                const session = this.sessionManager.getSession(sessionId);
                session.client = client;
                session.lastActive = new Date();
                
                // Set new expiration timeout
                this.sessionManager.setSessionTimeouts(sessionId, setTimeout(() => {
                    this.sessionManager.deleteSessionTimeouts(sessionId);
                }, this.SESSION_EXPIRY));
                
                // Tell client the session is restored
                client.emit('session_restored', sessionId);
                
                return;
            }

            // Create new session
            const sampleRate = this.validateClientConfig(client.handshake.query);
            this.logger.log(`Creating new session for client: ${clientId}`);
            
            this.sessionManager.createSession(sessionId, {
                sampleRate,
                createdAt: new Date()
            }, client);
            
            // Set session expiration timeout
            this.sessionManager.setSessionTimeouts(sessionId, setTimeout(() => {
                this.logger.log(`Session ${sessionId} expired after timeout`);
                this.sessionManager.deleteSessionTimeouts(sessionId);
            }, this.SESSION_EXPIRY));

            // Initialize SpeechToText session
            await this.speechToTextService.startSession(sessionId, sampleRate);
            
            // Respond with session ready
            client.emit('session_ready', sessionId);
            
        } catch (error) {
            this.logger.error(`Connection error: ${error.message}`);
            client.emit('error', { 
                code: 'CONNECTION_ERROR', 
                message: error.message 
            });
            client.disconnect(true);
        }
    }

    async handleDisconnect(client: Socket) {
        try {
            const clientId = client.handshake.query.clientId as string;
            if (!clientId) {
                return;
            }
            
            const sessionId = `ssid_${clientId}`;
            const session = this.sessionManager.getSession(sessionId);
            
            if (session) {
                this.logger.log(`Client disconnected, preserving session: ${sessionId}`);
                
                // Update the session timeout to clean it up if not reconnected
                this.sessionManager.setSessionTimeouts(sessionId, setTimeout(async () => {
                    this.logger.log(`Session ${sessionId} expired after disconnect timeout`);
                    await this.cleanupSession(sessionId);
                }, this.SESSION_EXPIRY));
            }
        } catch (error) {
            this.logger.error(`Error handling disconnect: ${error.message}`);
        }
    }

    @SubscribeMessage('ping')
    handlePing(client: Socket, callback: Function) {
        try {
            const clientId = client.handshake.query.clientId as string;
            if (clientId) {
                const sessionId = `ssid_${clientId}`;
                const session = this.sessionManager.getSession(sessionId);
                
                if (session) {
                    session.lastActive = new Date();
                }
            }
            
            if (typeof callback === 'function') {
                callback('pong');
            }
        } catch (error) {
            this.logger.error(`Error handling ping: ${error.message}`);
        }
    }

    @SubscribeMessage('restore_session')
    async handleRestoreSession(client: Socket, sessionId: string) {
        try {
            const session = this.sessionManager.getSession(sessionId);
            
            if (!session) {
                client.emit('error', { 
                    code: 'SESSION_NOT_FOUND', 
                    message: 'Session not found or expired' 
                });
                return;
            }
            
            // Update client reference and activity timestamp
            session.client = client;
            session.lastActive = new Date();
            
            client.emit('session_restored', sessionId);
            
            this.logger.log(`Session ${sessionId} explicitly restored via restore_session event`);
        } catch (error) {
            this.logger.error(`Error restoring session: ${error.message}`);
            client.emit('error', { 
                code: 'RESTORE_ERROR', 
                message: error.message 
            });
        }
    }

    @SubscribeMessage('audio_chunk')
    async handleAudioChunk(client: Socket, data: AudioChunkDto) {
        const clientId = client.handshake.query.clientId as string;
        if (!clientId) {
            client.emit('error', { code: 'INVALID_CLIENT', message: 'Invalid client ID' });
            return;
        }
        
        const sessionId = `ssid_${clientId}`;
        const session = this.sessionManager.getSession(sessionId);
        
        if (!session) {
            client.emit('error', { code: 'SESSION_NOT_FOUND', message: 'Session not found' });
            return;
        }
        
        // Update activity timestamp
        session.lastActive = new Date();
        
        // When receiving audio, set VAD status to speaking if not already
        if (session.context.vadStatus !== 'speaking' && session.context.vadStatus !== 'processing') {
            session.context.vadStatus = 'speaking';
            session.context.isSpeaking = true;
            client.emit('vad_status', { status: 'speaking' });
        }

        try {
            // Process audio chunk
            const transcription = await this.speechToTextService.transcribeAudio(
                sessionId,
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
            if (transcription.isFinal && transcription.text) {
                // Update VAD status to processing
                session.context.vadStatus = 'processing';
                client.emit('vad_status', { status: 'processing' });
                
                const aiResponse = await this.processFullUtterance(session, transcription.text, transcription.sentiment);
                
                // Update VAD status to responding before sending audio
                session.context.vadStatus = 'responding';
                client.emit('vad_status', { status: 'responding' });
                
                await this.sendAudioResponse(client, sessionId, aiResponse);
                
                // Reset VAD status to idle after sending response
                session.context.vadStatus = 'idle';
                client.emit('vad_status', { status: 'idle' });
            }

        } catch (error) {
            await this.handleProcessingError(client, session, error);
        }
    }

    @SubscribeMessage('end_call')
    async handleEndCall(client: Socket) {
        const clientId = client.handshake.query.clientId as string;
        if (!clientId) return;
        
        const sessionId = `ssid_${clientId}`;
        
        try {
            // First, get the session directly instead of using validateSession which might throw errors
            const session = this.sessionManager.getSession(sessionId);
            
            if (!session) {
                client.emit('error', { code: 'SESSION_NOT_FOUND', message: 'Session not found' });
                return;
            }
            
            // Update activity timestamp
            session.lastActive = new Date();
            
            try {
                // Try to finalize the session with speech-to-text service
                const finalResult = await this.speechToTextService.finalizeSession(session.id);
                if (finalResult) {
                    const aiResponse = await this.processFullUtterance(session, finalResult.text, finalResult.sentiment);
                    await this.sendAudioResponse(client, sessionId, aiResponse);
                }
            } catch (speechError) {
                // Log but don't halt execution
                this.logger.warn(`Error finalizing speech session: ${speechError.message}`);
            }
            
            // Always try to clean up the session, even if other parts failed
            try {
                // Close the session in the session manager
                this.sessionManager.closeSession(sessionId);
                
                // Clear any timeouts
                const timeout = this.sessionManager.getSessionTimeouts(sessionId);
                if (timeout) {
                    clearTimeout(timeout);
                    this.sessionManager.deleteSessionTimeouts(sessionId);
                }
                
                // Try to finalize in the database
                await this.interactionService.finalizeSession(sessionId);
            } catch (cleanupError) {
                this.logger.error(`Error cleaning up session: ${cleanupError.message}`);
            }
            
            // Notify client that call has ended
            client.emit('call_ended');
            
        } catch (error) {
            this.logger.error(`Error handling end_call: ${error.message}`);
            client.emit('error', { 
                code: 'END_CALL_ERROR', 
                message: 'Error ending call'
            });
        }
    }

    @SubscribeMessage('vad_update')
    async handleVadUpdate(client: Socket, data: { speaking: boolean }) {
        const clientId = client.handshake.query.clientId as string;
        if (!clientId) return;
        
        const sessionId = `ssid_${clientId}`;
        const session = this.sessionManager.getSession(sessionId);
        
        if (!session) return;
        
        // Update activity timestamp
        session.lastActive = new Date();
        
        // Store speaking state in session context
        session.context.isSpeaking = data.speaking;
        
        // If speaking started after processing, update VAD status to speaking
        if (data.speaking && session.context.vadStatus === 'processing') {
            // User started speaking again during processing
            session.context.vadStatus = 'speaking';
            // Send updated status
            client.emit('vad_status', { status: 'speaking' });
        } else if (data.speaking && !session.context.vadStatus) {
            // Initial speaking state
            session.context.vadStatus = 'speaking';
            client.emit('vad_status', { status: 'speaking' });
        }
    }

    @SubscribeMessage('speech_end')
    async handleSpeechEnd(client: Socket) {
        try {
            // Get important tracking info for logging
            const clientId = client.handshake.query.clientId as string;
            console.log(`Received speech_end event from client ${clientId}`);
            
            const sessionId = this.getSessionId(client);
            if (!sessionId) {
                this.logger.error('No session ID found for speech_end event');
                this.emitErrorToClient(client, 'session_not_found', 'Session not found');
                return;
            }

            const session = this.sessionManager.getSession(sessionId);
            if (!session) {
                this.logger.error(`Session ${sessionId} not found for speech_end event`);
                this.emitErrorToClient(client, 'session_not_found', 'Session not found');
                return;
            }

            // Log detailed session information for debugging
            this.logger.log(`Speech end detected for session ${sessionId}`);
            this.logger.debug(`Session state: VAD status=${session.context.vadStatus}, isSpeaking=${session.context.isSpeaking}, lastActive=${session.lastActive}`);
            
            // Check if the session has received any audio chunks
            const sttSession = this.speechToTextService.getSessionInfo(sessionId);
            if (sttSession) {
                this.logger.debug(`STT session info: hasPartialText=${!!sttSession.partialText}, hasFinaText=${!!sttSession.finalText}, textLength=${(sttSession.finalText || sttSession.partialText || '').length}`);
            } else {
                this.logger.warn(`STT session not found for ${sessionId} - might not have received audio yet`);
            }
            
            try {
                // Update state to processing immediately
                session.context.vadStatus = 'processing';
                client.emit('vad_status', { status: 'processing' });
                
                this.logger.log(`Finalizing speech for session ${sessionId} - getting transcript`);
                
                // Get final transcript with timeout protection
                const transcriptionPromise = this.speechToTextService.finalizeCurrentChunk(sessionId);
                
                // Add a timeout to prevent hanging if STT service doesn't respond
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Speech-to-text processing timeout')), 10000);
                });
                
                // Wait for transcription or timeout
                const result = await Promise.race([transcriptionPromise, timeoutPromise])
                  .catch(error => {
                    this.logger.error(`Error in STT processing: ${error.message}`);
                    // Return empty result to continue
                    return { text: '', isFinal: false, confidence: 0, words: [] };
                  }) as TranscriptionResult;
                
                // Check if we got a meaningful transcript
                if (result && result.text && result.text.trim().length > 0) {
                    this.logger.log(`Final transcript: "${result.text}" (confidence: ${result.confidence})`);
                    
                    // Process the full utterance and get AI response
                    const aiResponse = await this.processFullUtterance(session, result.text, result.sentiment);
                    
                    // Send the AI's text response immediately
                    if (aiResponse && aiResponse.text) {
                        client.emit('text_response', {
                            text: aiResponse.text,
                            timestamp: Date.now(),
                        });
                    }
                    
                    // Then send the audio response
                    await this.sendAudioResponse(client, sessionId, aiResponse);
                } else {
                    const hasReceivedAudio = await this.speechToTextService.hasReceivedAudio(sessionId);
                    this.logger.log(`No meaningful transcript found, skipping processing. Has received audio: ${hasReceivedAudio}`);
                    
                    // Reset status to idle since no processing needed
                    session.context.vadStatus = 'idle';
                    client.emit('vad_status', { status: 'idle' });
                    
                    // Send empty response to acknowledge the speech_end
                    client.emit('text_response', {
                        text: 'I didn\'t catch that. Could you please try again?',
                        timestamp: Date.now(),
                    });
                }
            } catch (error) {
                this.logger.error(`Error processing speech end: ${error.message}`);
                // Ensure we reset the status even on error
                session.context.vadStatus = 'idle';
                client.emit('vad_status', { status: 'idle' });
                this.emitErrorToClient(client, 'processing_error', 'Failed to process speech');
                
                // Send fallback response
                client.emit('text_response', {
                    text: 'Sorry, I had trouble processing that. Could you try again?',
                    timestamp: Date.now(),
                });
            }
        } catch (error) {
            this.logger.error(`Unhandled error in handleSpeechEnd: ${error.message}`);
            client.emit('vad_status', { status: 'idle' });
            this.emitErrorToClient(client, 'server_error', 'Unexpected server error');
        }
    }

    private async processFullUtterance(session: Session, transcriptionText: string, sentiment?: any): Promise<AiResponse> {
        // Get or create a transcription result
        const transcriptionResult: TranscriptionResult = {
            text: transcriptionText,
            isFinal: true,
            confidence: 1.0,
            words: [],
            sentiment: sentiment || { score: 0, label: 'neutral' }
        };
        
        // Update conversation history
        session.context = await this.updateConversationContext(
            session.context,
            transcriptionText,
            transcriptionResult
        );

        // Get AI response
        const aiResponse = await this.aiAgentService.processTranscription(
            transcriptionResult,
            session
        );

        // Update context with AI response
        session.context = <SessionContext>aiResponse.contextUpdates;

        return aiResponse;
    }

    private async sendAudioResponse(client: Socket, sessionId: string, aiResponse: AiResponse) {
        try {
            // Update VAD status to responding before sending audio
            const session = this.sessionManager.getSession(sessionId);
            if (!session) return;
            
            session.context.vadStatus = 'responding';
            client.emit('vad_status', { status: 'responding' });
            
            // Send audio chunks to client
            if (aiResponse.text) {
                const audioResponse = await this.textToSpeechService.synthesizeSpeech(
                    aiResponse.text,
                    session.context.sampleRate,
                    aiResponse.voicePreferences
                );
                
                client.emit('audio_response', {
                    audio: audioResponse.audio.toString('base64'),
                    format: audioResponse.format,
                    duration: audioResponse.duration || 0
                });
            }
            
            // Reset VAD status to idle after sending response
            session.context.vadStatus = 'idle';
            client.emit('vad_status', { status: 'idle' });
        } catch (error) {
            this.logger.error(`Error sending audio response: ${error.message}`);
            
            // Ensure we reset the VAD status even on error
            const session = this.sessionManager.getSession(sessionId);
            if (session) {
                session.context.vadStatus = 'idle';
            }
            client.emit('vad_status', { status: 'idle' });
            
            // Alert the client about the TTS failure
            this.emitErrorToClient(client, 'tts_error', 'Failed to generate speech response');
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
            try {
                // Remove session from memory first
                this.sessionManager.closeSession(session.id);
                
                // Then try to update database, but don't let errors block the flow
                try {
                    await this.interactionService.finalizeSession(session.id);
                } catch (dbError) {
                    this.logger.error(`Database error finalizing session: ${dbError.message}`);
                }
                
                throw new InactiveSessionError('Session expired due to inactivity');
            } catch (error) {
                // If the cleanup itself fails, still throw the original error
                if (!(error instanceof InactiveSessionError)) {
                    this.logger.error(`Error during session cleanup: ${error.message}`);
                    throw new InactiveSessionError('Session expired due to inactivity');
                }
                throw error;
            }
        }

        return session;
    }

    private async cleanupSession(sessionId: string): Promise<void> {
        try {
            const session = this.sessionManager.getSession(sessionId);
            if (session) {
                // First clear any timeouts to prevent race conditions
                const timeout = this.sessionManager.getSessionTimeouts(sessionId);
                if (timeout) {
                    clearTimeout(timeout);
                    this.sessionManager.deleteSessionTimeouts(sessionId);
                }
                
                // Try to finalize the session in the database
                try {
                    await this.interactionService.finalizeSession(sessionId);
                } catch (dbError) {
                    // Log but continue with cleanup
                    this.logger.error(`Database error during session cleanup: ${dbError.message}`);
                }
                
                // Finally close the session in memory
                this.sessionManager.closeSession(sessionId);
            }
        } catch (error) {
            this.logger.error(`Error during session cleanup: ${error.message}`);
        }
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
            client.emit('error', { 
                code: errorType, 
                message: error.message,
                retriesLeft: this.MAX_RETRIES - session.context.retryCount 
            });
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
        // To be implemented
        return 1; // Placeholder implementation
    }

    private async pruneInactiveSessions() {
        try {
            const now = Date.now();
            let prunedCount = 0;
            
            for (const sessionId of this.sessionManager.getAllSessionIds()) {
                const session = this.sessionManager.getSession(sessionId);
                
                if (!session) continue;
                
                const inactiveDuration = now - session.lastActive.getTime();
                
                if (inactiveDuration > this.INACTIVE_TIMEOUT) {
                    await this.cleanupSession(sessionId);
                    prunedCount++;
                }
            }
            
            if (prunedCount > 0) {
                this.logger.log(`Pruned ${prunedCount} inactive sessions`);
            }
        } catch (error) {
            this.logger.error(`Error pruning sessions: ${error.message}`);
        }
    }

    private getSessionId(client: Socket): string | null {
        const clientId = client.handshake.query.clientId as string;
        if (clientId) {
            return `ssid_${clientId}`;
        }
        return null;
    }

    private emitErrorToClient(client: Socket, code: string, message: string) {
        client.emit('error', {
            code,
            message,
        });
    }
}