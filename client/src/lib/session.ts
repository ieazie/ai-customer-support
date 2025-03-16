import { nanoid } from 'nanoid';


const CLIENT_ID_KEY = 'voice_client_id';
const SESSION_KEY = 'voice_session';

export const getPersistedSession = () => {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  const sessionId = localStorage.getItem(SESSION_KEY); // Direct string value

  if (!clientId) {
    clientId = nanoid(11);
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }

  return {
    clientId,
    sessionId
  };
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(CLIENT_ID_KEY);
};