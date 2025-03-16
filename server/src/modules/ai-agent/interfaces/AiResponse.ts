import {VoicePreferences} from "./VoicePreference";

export interface AiResponse {
    text: string;
    voicePreferences: VoicePreferences;
    contextUpdates:  Record<string, any>;
}