import { SessionState, ErrorType } from './session.enums';
import { Socket } from 'socket.io';

export interface Session {
  id: string;
  context: SessionContext;
  client: Socket
  lastActive: Date;
}

export interface SessionContext {
  state: SessionState;
  retryCount: number;
  lastError?: ErrorType;
  conversationHistory: ConversationTurn[];
  customerMetadata: CustomerMetadata;
  systemState: SystemState;
  clientInfo: ClientConnectionInfo;
  sampleRate?: number;
  createdAt: Date;
}

export interface ConversationTurn {
  text: string;
  sentiment: number;
  timestamp: Date;
  source: 'user' | 'ai';
}

export interface CustomerMetadata {
  technicalLevel?: 'beginner' | 'intermediate' | 'advanced';
  preferredLanguage?: string;
  deviceType?: string;
}

export interface SystemState {
  requiresHandoff: boolean;
  pendingOperations: number;
  lastSuccessfulOperation?: Date;
}

export interface ClientConnectionInfo {
  ipAddress?: string;
  userAgent?: string;
  connectedAt: Date;
  lastActiveAt: Date;
  protocol: 'websocket' | 'http';
  geolocation?: GeoLocation;
}

export interface GeoLocation {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
}
