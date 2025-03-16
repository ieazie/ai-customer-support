import { Module} from "@nestjs/common";
import {CallHandlerGateway} from "./call-handler.gateway";
import {SpeechToTextModule} from "../speech-to-text/speech-to-text.module";
import {TextToSpeechModule} from "../text-to-speech/text-to-speech.module";
import {AiAgentModule} from "../ai-agent/ai-agent.module";
import {InteractionModule} from "../analytics/interaction.module";
import {SessionManagerModule} from '../session/session-manager.module';

@Module({
    imports: [SpeechToTextModule, TextToSpeechModule, AiAgentModule, InteractionModule, SessionManagerModule],
    providers: [CallHandlerGateway],
})
export class CallHandlerModule {}