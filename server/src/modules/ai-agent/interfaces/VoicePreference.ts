export interface VoicePreferences {
    voice: 'female_01' | 'female_02' | 'male_01' | 'male_02';
    speed: number; // 0.5-2.0
    pitch: number; // -1.0 to 1.0
    modulation?: number; // 0-1
}