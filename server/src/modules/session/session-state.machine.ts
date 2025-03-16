import { SessionState, ErrorType } from './session.enums';

export class SessionStateMachine {
  private transitions = {
    [SessionState.INITIALIZING]: {
      AUTH_SUCCESS: SessionState.ACTIVE,
      AUTH_FAILURE: SessionState.CLOSED
    },
    [SessionState.ACTIVE]: {
      PROCESSING_ERROR: SessionState.AWAITING_RETRY,
      HANDOFF_REQUESTED: SessionState.PENDING_HANDOFF
    },
    [SessionState.AWAITING_RETRY]: {
      RETRY_SUCCESS: SessionState.ACTIVE,
      RETRY_FAILURE: SessionState.PENDING_HANDOFF
    },
    [SessionState.PENDING_HANDOFF]: {
      HANDOFF_COMPLETE: SessionState.CLOSED
    }
  };

  transition(currentState: SessionState, action: string): SessionState {
    return this.transitions[currentState][action] || currentState;
  }

  getActionForError(errorType: ErrorType): string {
    return {
      'STT_FAILURE': 'PROCESSING_ERROR',
      'AI_FAILURE': 'PROCESSING_ERROR',
      'TTS_FAILURE': 'PROCESSING_ERROR',
      'NETWORK_FAILURE': 'PROCESSING_ERROR'
    }[errorType];
  }
}