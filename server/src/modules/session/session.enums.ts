export enum SessionState {
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  AWAITING_RETRY = 'awaiting_retry',
  PENDING_HANDOFF = 'pending_handoff',
  CLOSED = 'closed',
  HANDOFF_IN_PROGRESS= 'handoff_in_progress'
}

export type ErrorType =
  'STT_FAILURE' |
  'AI_FAILURE' |
  'TTS_FAILURE' |
  'NETWORK_FAILURE' |
  'TIMEOUT' |
  'AUTH_FAILURE';