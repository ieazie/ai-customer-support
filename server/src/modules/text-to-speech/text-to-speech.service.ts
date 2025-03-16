// modules/tts/tts.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {AudioResponse} from "./interfaces/AudioResponse";
import { TextToSpeechSynthesisError } from '../../common/errors/text-to-speech-synthesis.error';

@Injectable()
export class TextToSpeechService {
    private readonly logger = new Logger(TextToSpeechService.name);
    private readonly baseUrl = 'https://api.assemblyai.com/v2/text-to-speech';

    constructor(private readonly configService: ConfigService) {}

    async synthesizeSpeech(
        text: string,
        sampleRate: number,
        preferences?: { voice?: string; speed?: number; pitch?: number }
    ): Promise<AudioResponse> {
        try {
            const response = await axios.post(
                this.baseUrl,
                {
                    text,
                    voice: preferences?.voice || 'female_01',
                    sample_rate: sampleRate,
                    speed: preferences?.speed ?? 1.0,
                    pitch: preferences?.pitch ?? 0.0,
                    output_format: 'wav'
                },
                {
                    headers: {
                        authorization: this.configService.get<string>('ASSEMBLYAI_API_KEY'),
                        'content-type': 'application/json'
                    },
                    responseType: 'arraybuffer'
                }
            );

            return {
                audio: Buffer.from(response.data),
                format: 'wav',
                duration: this.calculateAudioDuration(response.data, sampleRate),
                sampleRate,
                wordTimestamps: response.data.word_timestamps || []
            };
        } catch (error) {
            this.logger.error(`TextToSpeechService Error: ${error.message}`);
            throw new TextToSpeechSynthesisError('Failed to synthesize speech', text);
        }
    }

    private calculateAudioDuration(audioData: ArrayBuffer, sampleRate: number): number {
        const bytesPerSample = 2; // 16-bit PCM
        const numChannels = 1; // Mono
        const totalSamples = audioData.byteLength / (bytesPerSample * numChannels);
        return totalSamples / sampleRate;
    }
}