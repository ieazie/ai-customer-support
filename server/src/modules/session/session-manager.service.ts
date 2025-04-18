import { Injectable, Logger } from '@nestjs/common';
import { SessionStateMachine } from './session-state.machine';
import { SessionState, ErrorType } from './session.enums';
import { ClientConnectionInfo, Session, SessionContext } from './session.interface';
import { SessionNotFoundError} from '../../common/errors/session-not-found.error';
import { Socket } from 'socket.io';
import { CustomerProfile } from '../call-handler/interfaces/CustomerProfile';

@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);
  private sessions = new Map<string, Session>();
  private readonly stateMachine = new SessionStateMachine();
  private sessionTimeouts = new Map<string, NodeJS.Timeout>();

  constructor() {
  }

  createSession(sessionId:string, initialContext: Partial<SessionContext>, client:Socket): Session {
    const session: Session = {
      id: sessionId,
      client,
      context: {
        ...this.defaultSessionContext(),
        ...initialContext,
        createdAt: new Date(),
        clientInfo: {
          ...this.extractClientMetadata(client),
          connectedAt: new Date(),
          lastActiveAt: new Date(),
          protocol: 'websocket'
        }
      },
      lastActive: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.logger.log(`Session created: ${sessionId}`);
    return session;
  }

  getSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} not found`);
      return null;
      // throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  getSessionTimeouts(sessionId: string): NodeJS.Timeout {
    const timeout = this.sessionTimeouts.get(sessionId);
    if (!timeout) {
      this.logger.warn(`Session ${sessionId} has no timeout set`);
      return null;
      // throw new SessionNotFoundError(sessionId);
    }
    return timeout;
  }

  setSessionTimeouts(sessionId: string, timeout: NodeJS.Timeout): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessionTimeouts.set(sessionId, timeout);
    }
  }

  deleteSessionTimeouts(sessionId: string): void {
    const session = this.sessionTimeouts.get(sessionId);
    if (session) {
      this.sessionTimeouts.delete(sessionId);
    }
  }

  updateSessionState(sessionId: string, newState: SessionState): void {
    const session = this.getSession(sessionId);
    session.context.state = newState;
    session.context.clientInfo.lastActiveAt = new Date();
    session.lastActive = new Date();
    this.logger.debug(`Session ${sessionId} state updated to ${newState}`);
  }

  handleError(sessionId: string, errorType: ErrorType): void {
    const session = this.getSession(sessionId);
    session.context.lastError = errorType;
    session.context.retryCount++;

    const action = this.stateMachine.getActionForError(errorType);
    const newState = this.stateMachine.transition(session.context.state, action);

    this.updateSessionState(sessionId, newState);
    this.logger.error(`Session error: ${sessionId} - ${errorType}`);
  }

  closeSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      // Cleanup resources here
      this.sessions.delete(sessionId);
      
      // Also clean up any timeouts
      if (this.sessionTimeouts.has(sessionId)) {
        const timeout = this.sessionTimeouts.get(sessionId);
        if (timeout) {
          clearTimeout(timeout);
        }
        this.sessionTimeouts.delete(sessionId);
      }
      
      this.logger.log(`Session closed: ${sessionId}`);
    } else {
      this.logger.warn(`Attempted to close non-existent session: ${sessionId}`);
    }
  }

  private extractClientMetadata(client: Socket): CustomerProfile {
    return {
      userAgent: client.handshake.headers['user-agent'],
      ipAddress: client.handshake.address,
      // Add additional metadata extraction as needed
    };
  }

  private defaultSessionContext(): Omit<SessionContext, 'clientInfo'> {
    return {
      state: SessionState.INITIALIZING,
      retryCount: 0,
      conversationHistory: [],
      customerMetadata: {},
      systemState: {
        requiresHandoff: false,
        pendingOperations: 0
      },
      createdAt: new Date()
    };
  }

  // Additional methods for batch operations
  pruneInactiveSessions(timeoutMs: number): void {
    const cutoff = Date.now() - timeoutMs;
    for (const [id, session] of this.sessions) {
      if (session.lastActive.getTime() < cutoff) {
        this.closeSession(id);
      }
    }
  }

}