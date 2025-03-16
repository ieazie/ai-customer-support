import { create } from 'zustand/react';
import { AudioResponse } from '@/lib/audioUtils';

interface TranscriptionItem {
  text: string;
  isFinal: boolean;
  sentiment?: number;
}

interface CallState {
  isConnected: boolean;
  isRecording: boolean;
  sessionId: string | null;
  queuedAudio: AudioResponse | null;
  transcripts: TranscriptionItem[];
  errors: string[];
  sessionStatus: 'resumed' | 'new' | 'fresh';
  handoffStatus: 'pending' | 'failed' | 'success' | null;
  actions: {
    addTranscript: (item: TranscriptionItem) => void;
    setConnection: (connected: boolean) => void;
    setRecording: (recording: boolean) => void;
    setSession: (sessionId: string, status: 'resumed' | 'new') => void;
    queueAudio: (response: AudioResponse) => void;
    clearAudioQueue: () => void;
    addError: (error: string) => void;
    setHandoffStatus: (status: CallState['handoffStatus']) => void;
    clearTranscripts: () => void;
    startCall: () => void;
    endCall: () => void;
    restoreSession: (sessionId: string) => void;
  }
}

export const useCallStore = create<CallState>((set) => ({
  isConnected: false,
  isRecording: false,
  sessionId: null,
  transcripts: [],
  errors: [],
  sessionStatus: 'fresh',
  queuedAudio: null,
  handoffStatus: null,
  actions: {
    addTranscript: (item) => set((state) => ({
      transcripts: [...state.transcripts.filter(t => !t.isFinal), item]
    })),
    setConnection: (connected) => set({ isConnected: connected }),
    setRecording: (recording) => set({ isRecording: recording }),
    setSession: (sessionId, status) => set({
      sessionId,
      sessionStatus: status,
      isRecording:  status === 'resumed'
    }),
    addError: (error) => set((state) => ({
      errors: [...state.errors, error]
    })),
    setHandoffStatus: (status) => set({ handoffStatus: status }),
    clearTranscripts: () => set({ transcripts: [] }),
    queueAudio: (audio: AudioResponse) => set({ queuedAudio: audio }),
    clearAudioQueue: () => set({ queuedAudio: undefined }),
    startCall: () => set({ isRecording: true }),
    endCall: () => set({
      isRecording: false,
      sessionId: null,
      transcripts: [],
      errors: []
    }),
    restoreSession: (sessionId: string) => set({
      sessionId,
      sessionStatus: 'resumed',
      isRecording: true
    })
  }
}));