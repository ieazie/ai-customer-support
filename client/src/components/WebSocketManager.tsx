import { useEffect, useState } from 'react';
import { useCallStore } from '@/stores/useCallStore';
import { initSocket, getSocket } from '@/lib/websocket';
import { AudioResponse } from '@/lib/audioUtils';
import { getPersistedSession } from '@/lib/session';


export const WebSocketManager = () => {
  const { sessionId, isRecording, actions } = useCallStore();

  // WebSocket connection management
  useEffect(() => {
    const socket = initSocket();
    const { sessionId } = getPersistedSession();

      const handleDisconnect = () => actions.setConnection(false);

      const handleConnect = () => {
        actions.setConnection(true);
        if (sessionId) {
          // Explicitly request session restoration
          socket?.emit('restore_session', sessionId);
        }
      };

      const handleSessionRestored = (data: { id: string }) => {
        if(isRecording){
          actions.setSession(data.id,  'resumed');
          console.log('Session restored:', data.id);
        }
      };

      const handleNewSession = (sessionId: string) => {
          // Only set new session if not in call
          actions.setSession(sessionId, 'new');
          console.log('New session created:', sessionId);
      }

      socket?.on('connect', handleConnect);
      socket?.on('disconnect', handleDisconnect);
      socket?.on('session_ready', handleNewSession);
      socket?.on('partial_transcript', (data: any) => actions.addTranscript({ text: data.text, isFinal: false }));
      socket?.on('final_transcript', (data: any) => actions.addTranscript({ text: data.text, isFinal: true }));
      socket?.on('audio_response', (data: AudioResponse) => {
        // Forward to AudioPlayer via store
        actions.queueAudio(data);
      });
      socket?.on('handoff_initiated', () => actions.setHandoffStatus('pending'));
      socket?.on('handoff_failed', () => {
        actions.setHandoffStatus('failed');
        actions.addError('Failed to transfer to human agent');
      });
      socket?.on('error', (err: Error) => {
        actions.addError('Failed to transfer to human agent');
      });
    socket?.on('session_restored', (sessionId: string) => {
      actions.restoreSession(sessionId);
    });
    // Request session restoration only if we have a session ID
    if (sessionId) {
      // socket.emit('session_restored', {
      //   clientId: getPersistedSession().clientId,
      //   sessionId
      // });
      socket?.on('session_restored', (sessionId: string) => {
        actions.restoreSession(sessionId);
      });
    }

      return () => {
        socket?.off('session_restored', handleSessionRestored);
        socket?.off('session_ready', handleNewSession);

      };
  }, [isRecording, actions]);


  return null;
}
