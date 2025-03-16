import { io, Socket } from 'socket.io-client';

import { getAudioConfig } from './client';
import { getPersistedSession } from '@/lib/session';

// Define custom Socket type with auth properties
interface CustomSocket extends Socket {
  auth: {
    clientId: string;
    sessionId?: string;
    sampleRate?: number;
  },
  query: {
    clientId: string;
    sessionId?: string;
    sampleRate?: number;
  }
}

let socket: CustomSocket | null = null;

export const initSocket = () => {
  const { clientId, sessionId } = getPersistedSession();
  const { sampleRate } = getAudioConfig();

  // Always create new instance if sessionId changes
  if (socket?.connected) {
    // Only reconnect if client ID changes
    if (socket.auth.clientId !== clientId) {
      socket.disconnect();
      socket = null;
    }
  }

  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_WS_URL!, {
      path: '/voice-support',
      transports: ['websocket'],
      query:{
        clientId,
        sessionId,
        sampleRate
      },
      auth: {
        clientId,
        sessionId,
        sampleRate
      },
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: 5,
      autoConnect: true,
    }) as CustomSocket;
  }

  return socket;
};

export const getSocket = () => socket;
