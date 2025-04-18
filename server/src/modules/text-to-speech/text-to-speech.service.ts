import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioResponse } from "./interfaces/AudioResponse";
import { TextToSpeechSynthesisError } from '../../common/errors/text-to-speech-synthesis.error';
import axios from 'axios';

// Import Polly types for TypeScript validation
import { VoiceId } from '@aws-sdk/client-polly';

@Injectable()
export class TextToSpeechService {
    private readonly logger = new Logger(TextToSpeechService.name);
    private client: any; // Will hold the Polly client
    private isAWSConfigured = false;

    constructor(private readonly configService: ConfigService) {
        // We need to import the AWS SDK dynamically to avoid issues with browser implementations
        this.initializePollyClient().catch(error => {
            this.logger.error(`Failed to initialize Polly client: ${error.message}`);
        });
    }

    private async initializePollyClient() {
        try {
            // Dynamically import AWS SDK to avoid issues with webpack/browser
            const { PollyClient } = await import('@aws-sdk/client-polly');
            
            const awsAccessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
            const awsSecretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
            const awsRegion = this.configService.get<string>('AWS_REGION') || 'eu-central-1';
            
            if (awsAccessKeyId && awsSecretAccessKey) {
                this.client = new PollyClient({
                    region: awsRegion,
                    credentials: {
                        accessKeyId: awsAccessKeyId,
                        secretAccessKey: awsSecretAccessKey,
                    },
                });
                this.isAWSConfigured = true;
                this.logger.log('Amazon Polly client initialized successfully');
            } else {
                this.logger.warn('AWS credentials not configured, using fallback audio generation');
            }
        } catch (error) {
            this.logger.error(`Error initializing Polly client: ${error.message}`);
            throw error;
        }
    }

    async synthesizeSpeech(
        text: string,
        sampleRate: number,
        preferences?: { voice?: string; speed?: number; pitch?: number }
    ): Promise<AudioResponse> {
        try {
            // Validate text is provided
            if (!text || text.trim() === '') {
                this.logger.warn('Empty text provided for speech synthesis');
                text = 'I didn\'t catch that. Could you please repeat?';
            }

            // Only attempt to use Polly if AWS is configured
            if (this.isAWSConfigured && this.client) {
                try {
                    // Import required AWS types dynamically
                    const { SynthesizeSpeechCommand, OutputFormat } = 
                        await import('@aws-sdk/client-polly');
                    
                    // Get the voice name
                    const voiceName = this.mapVoiceToPolly(preferences?.voice);
                    
                    // Ensure valid sample rate for Polly (only 8000, 16000, 22050, or 24000 are allowed)
                    const validSampleRates = [8000, 16000, 22050, 24000];
                    const pollySampleRate = validSampleRates.includes(sampleRate) 
                        ? sampleRate 
                        : 16000; // Default to 16000 if not valid
                    
                    this.logger.log(`Synthesizing speech using Amazon Polly with voice ${voiceName} at ${pollySampleRate}Hz: "${text.substring(0, 50)}..."`);
                    
                    // Create the speech synthesis command
                    const command = new SynthesizeSpeechCommand({
                        Text: text,
                        OutputFormat: OutputFormat.MP3,
                        SampleRate: String(pollySampleRate), // Use the valid sample rate
                        // Use the proper type cast for VoiceId
                        VoiceId: voiceName as VoiceId,
                        Engine: 'neural',
                        TextType: 'text',
                    });
                    
                    // Execute the command
                    const response = await this.client.send(command);
                    
                    // Process the audio stream
                    if (!response.AudioStream) {
                        throw new Error('No audio stream returned from Polly');
                    }
                    
                    // Convert the readable stream to a buffer
                    const chunks: Buffer[] = [];
                    const audioStream = response.AudioStream as any;
                    
                    await new Promise((resolve, reject) => {
                        audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
                        audioStream.on('error', reject);
                        audioStream.on('end', resolve);
                    });
                    
                    const audioBuffer = Buffer.concat(chunks);
                    
                    // Duration estimation for MP3 (this is approximate)
                    // More accurate duration would require parsing MP3 headers
                    const bitRate = 192000; // bits per second (typical MP3 bit rate)
                    const duration = (audioBuffer.length * 8) / bitRate;
                    
                    return {
                        audio: audioBuffer,
                        format: 'mp3',
                        duration: duration,
                        sampleRate: sampleRate,
                        wordTimestamps: []
                    };
                } catch (pollyError) {
                    this.logger.error(`Amazon Polly Error: ${pollyError.message}`);
                    
                    // Add more detailed debug information
                    if (pollyError.name === 'ValidationException') {
                        this.logger.error(`Polly validation error: Sample rate: ${sampleRate}, Voice: ${this.mapVoiceToPolly(preferences?.voice)}`);
                    }
                    
                    // Log complete error object if available
                    if (pollyError.$metadata) {
                        this.logger.error(`Polly error metadata: ${JSON.stringify(pollyError.$metadata)}`);
                    }
                    
                    throw pollyError; // Re-throw to use fallback
                }
            } else {
                this.logger.warn('AWS Polly not configured, using fallback audio generation');
                throw new Error('AWS Polly not initialized');
            }
        } catch (error) {
            // Generate fallback audio if Polly fails or isn't configured
            this.logger.warn(`Using fallback audio generation: ${error.message}`);
            return this.generateFallbackAudio(text, sampleRate);
        }
    }

    // Map voice preferences to Amazon Polly voices
    private mapVoiceToPolly(voicePreference?: string): string {
        // Default to a neutral female voice if no preference
        if (!voicePreference) {
            return 'Joanna';
        }
        
        // Map voice preferences to Polly voices - using string literals instead of enum
        const voiceMap: Record<string, string> = {
            'female': 'Joanna',
            'male': 'Matthew',
            'female_01': 'Joanna',
            'female_02': 'Kendra',
            'female_03': 'Kimberly',
            'male_01': 'Matthew',
            'male_02': 'Brian',
            'male_03': 'Kevin',
            'british': 'Amy',
            'australian': 'Olivia',
            'indian': 'Kajal',
            'spanish': 'Lupe',
            'french': 'Celine',
            'german': 'Vicki',
            'italian': 'Bianca',
            'japanese': 'Takumi',
            'korean': 'Seoyeon',
            'portuguese': 'Camila',
            'madison': 'Joanna',
        };
        
        return voiceMap[voicePreference.toLowerCase()] || 'Joanna';
    }

    // Generate fallback audio when AWS fails
    private generateFallbackAudio(text: string, sampleRate: number): AudioResponse {
        this.logger.warn(`Using local audio generation as fallback with sample rate: ${sampleRate}Hz`);
        
        try {
            // Ensure valid sample rate even for local generation
            const normalizedSampleRate = Math.min(Math.max(8000, sampleRate), 48000);
            
            // Generate audio based on text length to provide some feedback
            const duration = Math.min(2 + text.length / 20, 10); // Scale with text length, max 10 seconds
            const numSamples = Math.floor(normalizedSampleRate * duration);
            const buffer = Buffer.alloc(numSamples * 2); // 16-bit samples = 2 bytes per sample
            
            // Generate a pattern of tones to simulate speech rhythm
            const wordCount = Math.max(1, text.split(' ').length);
            const tonesPerWord = Math.floor(numSamples / wordCount);
            
            for (let i = 0; i < numSamples; i++) {
                // Create a different frequency for each word to simulate speech cadence
                const wordIndex = Math.floor(i / tonesPerWord);
                const baseFreq = 200 + (wordIndex % 5) * 100; // Vary between 200-600 Hz
                
                // Add some variation within each word
                const position = (i % tonesPerWord) / tonesPerWord;
                const freqVariation = Math.sin(position * Math.PI) * 50;
                
                // Calculate the final frequency and amplitude
                const frequency = baseFreq + freqVariation;
                const amplitude = 0.5 + 0.5 * Math.sin(position * Math.PI); // Fade in/out for each word
                
                // Generate sine wave sample
                const sample = Math.sin(2 * Math.PI * frequency * i / normalizedSampleRate) * amplitude * 0x7FFF;
                buffer.writeInt16LE(Math.floor(sample), i * 2);
            }
            
            return {
                audio: buffer,
                format: 'wav',
                duration: duration,
                sampleRate: normalizedSampleRate,
                wordTimestamps: []
            };
        } catch (fallbackError) {
            this.logger.error(`Fallback audio generation failed: ${fallbackError.message}`);
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