import { useEffect } from 'react';
import { useCallStore } from '@/stores/useCallStore';

import { AudioRecorder} from '@/components/AudioRecorder';
import { WebSocketManager} from '@/components/WebSocketManager';
import { AudioPlayer } from '@/components/AudioPlayer';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { HandoffStatus } from '@/components/HandoffStatus';
import { TranscriptView } from '@/components/TranscriptView';
import { getSocket } from '@/lib/websocket';
import { StopIcon } from '@/components/Icons/StopIcon';
import { PhoneIcon } from '@/components/Icons/PhoneIcon';


// Session storage configuration
const SESSION_KEY = 'voice_session';
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export default function VoiceSupport() {
  const { isRecording, sessionId, actions } = useCallStore();

  // Load existing session on mount
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sessionId) {
        console.log('Restored session:', sessionId);
        localStorage.setItem(SESSION_KEY, sessionId);
        e.preventDefault();
        e.returnValue = 'You have an active call - are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (!isRecording) {
        localStorage.removeItem(SESSION_KEY);
      }
    };
  }, [sessionId, isRecording]);

  // Handle call start/stop
  const handleCallToggle = () => {
    if (isRecording) {
      // End call logic
      localStorage.removeItem(SESSION_KEY);
      actions.endCall();
      if(sessionId){
        getSocket()?.emit('end_session', sessionId);
      }
    } else {
      // Start new call
      actions.startCall();
    }
  };

  // Session persistence
  useEffect(() => {
    if (sessionId) {
      console.log('Persisted session:', sessionId);
      localStorage.setItem(SESSION_KEY, sessionId);
      // localStorage.setItem('voice_client_id', getOrCreateClientId());
    }
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-6">
        <WebSocketManager />
        <AudioRecorder />
        <AudioPlayer />

        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          AI Support Assistant
        </h1>

        <div className="space-y-4 mb-6">
          <ConnectionStatus />
          <HandoffStatus />
        </div>

        <TranscriptView />

        <button
          onClick={handleCallToggle}
          className={`w-full py-3 rounded-lg font-medium text-white flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isRecording ? (
            <>
              <StopIcon className="w-5 h-5 mr-2" />
              End Call
            </>
          ) : (
            <>
              <PhoneIcon className="w-5 h-5 mr-2" />
              Start Call
            </>
          )}
        </button>
      </div>
    </div>
  );
}