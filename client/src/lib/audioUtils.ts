export interface AudioResponse {
  audio: string;
  format: 'wav' | 'mp3';
  duration: number;
}

export const encodeAudioChunk = async (data: Blob): Promise<Uint8Array> => {
  const buffer = await data.arrayBuffer();
  return new Uint8Array(buffer);
};

export const decodeAudioResponse = (response: AudioResponse): ArrayBuffer => {
  try {
    // Validate input structure
    if (!response?.audio) {
      throw new Error('Invalid audio response structure');
    }

    // Normalize base64 string (handle data URL case)
    const base64Data = response.audio.split(';base64,').pop() || '';

    // Validate base64 format
    if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(base64Data)) {
      throw new Error('Invalid base64 audio data');
    }

    // Decode base64
    const binaryString = atob(base64Data);

    // Convert to ArrayBuffer
    const buffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      buffer[i] = binaryString.charCodeAt(i);
    }

    // Optional format validation
    if (response.format) {
      const validFormats = ['audio/wav', 'audio/mpeg', 'audio/webm'];
      if (!validFormats.includes(response.format)) {
        console.warn(`Unsupported audio format: ${response.format}`);
      }
    }

    return buffer.buffer;
  } catch (error: any) {
    const errorMessage = error instanceof Error
      ? error.message
      : 'Unknown audio decoding error';
    throw new Error(`Audio decoding failed: ${errorMessage}`);
  }
};
