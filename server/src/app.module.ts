import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigModule } from '@nestjs/config';

import { DatabaseModule} from "./modules/database/database.module";
import {CallHandlerModule} from "./modules/call-handler/call-handler.module";
import {InteractionModule} from "./modules/analytics/interaction.module";
import {TextToSpeechModule} from "./modules/text-to-speech/text-to-speech.module";
import {SpeechToTextModule} from "./modules/speech-to-text/speech-to-text.module";
import {AiAgentModule} from "./modules/ai-agent/ai-agent.module";


@Module({
  imports: [
    TypeOrmModule.forRoot({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [__dirname + 'src/**/*.entity{.ts,.js}'],
        migrations: [__dirname + 'src/migrations/*{.ts,.js}'],
        synchronize: false,
        logging: true,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    CallHandlerModule,
    InteractionModule,
    TextToSpeechModule,
    SpeechToTextModule,
    AiAgentModule,
  ],
})
export class AppModule {}
