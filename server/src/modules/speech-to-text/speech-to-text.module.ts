import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SpeechToTextService } from './speech-to-text.service';

@Module({
    imports: [ConfigModule],
    providers: [SpeechToTextService],
    exports: [SpeechToTextService],
})
export class SpeechToTextModule {}