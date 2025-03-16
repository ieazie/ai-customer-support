import { useEffect, useRef, useState } from 'react';
import { useCallStore } from '@/stores/useCallStore';
import { decodeAudioResponse } from '@/lib/audioUtils';
import { initSocket } from '@/lib/websocket';


export const AudioPlayer = () => {
  const audioQueue = useRef<ArrayBuffer[]>([]);
  const isPlaying = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { queuedAudio, actions } = useCallStore();
  const [requiresActivation, setRequiresActivation] = useState(true);


  // Initialize audio context after user interaction
  const initializeAudio = async () => {
    try {
        // Create audio context after user interaction
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        const sessionId = useCallStore.getState().sessionId;

        // Update socket with valid sample rate
        initSocket();
        audioContextRef.current = audioContext;

        setRequiresActivation(false);
        processQueue();
    } catch (error) {
      console.error('Audio initialization failed:', error);
      actions.addError('Failed to initialize audio');
    }
  };

  // Handle audio_response messages from WebSocket
  useEffect(() => {
      if (queuedAudio) {
        try {
          const decoded = decodeAudioResponse(queuedAudio);
          audioQueue.current.push(decoded);
          processQueue();
        } catch (error) {
          actions.addError('Failed to decode audio response');
        }
        actions.clearAudioQueue();
      }
  }, [queuedAudio, actions]);

  const processQueue = async () => {
    if (!audioContextRef.current ||
      isPlaying.current ||
      audioQueue.current.length === 0) return;

    isPlaying.current = true;

    try {
      const buffer = await audioContextRef.current.decodeAudioData(
        audioQueue.current.shift()!
      );

      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);

      source.onended = () => {
        isPlaying.current = false;
        processQueue();
      };
    } catch (err) {
      isPlaying.current = false;
      actions.addError('Error playing audio response');
    }
  };

  if (requiresActivation) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-pulse">
        <button
          onClick={initializeAudio}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg
                     transition-all flex items-center justify-center w-14 h-14
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072M12 18.364a7 7 0 010-12.728M19 14l-7 7m0 0l-7-7m7 7V4"
            />
          </svg>
        </button>
      </div>
    );
  }
}