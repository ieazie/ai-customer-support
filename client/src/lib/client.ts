import { nanoid } from 'nanoid';

const CLIENT_ID_KEY = 'voice_client_id';

export const getAudioConfig = () => {
  const config = localStorage.getItem('audio_config');
  return config ? JSON.parse(config) : { sampleRate: 44100 };
};

export const getOrCreateClientId = (): string => {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);

  if (!clientId) {
    clientId = nanoid(11);
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }

  return clientId;
};

export const resetClientId = (): void => {
  localStorage.removeItem(CLIENT_ID_KEY);
};