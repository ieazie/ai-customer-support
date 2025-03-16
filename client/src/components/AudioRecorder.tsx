import { useEffect, useRef } from 'react';
import { useCallStore } from '@/stores/useCallStore';
import { encodeAudioChunk } from '@/lib/audioUtils';

export const AudioRecorder = () => {
  const { isRecording, sessionId, actions } = useCallStore();
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext.current = new AudioContext()

       mediaRecorder.current = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
         audioBitsPerSecond: 16000
       });

        mediaRecorder.current.ondataavailable = async (event) => {
          if(event.data.size > 0 && sessionId) {
          const chunk = await encodeAudioChunk(event.data);
          const message = JSON.stringify({
            type: 'audio_chunk',
            sessionId,
            chunk: Array.from(chunk)
          });
          // Send via WebSocket handler
          }
        };

        mediaRecorder.current.start(500);
        actions.setRecording(true);
    } catch (error) {
      actions.addError('Microphone access required');
    }
  }

  const stopRecording = async () => {
    mediaRecorder.current?.stop();
    actions.setRecording(false);
    await audioContext.current?.close();
  }

  useEffect(() => {
    if(isRecording) {
       startRecording().catch(console.error);
    } else {
      stopRecording().catch(console.error);
    }
  }, [isRecording]);

  return null;
}