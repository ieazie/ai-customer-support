import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InteractionModule } from '../analytics/interaction.module';
import { AiAgentService } from './ai-agent.service';

@Module({
    imports: [ConfigModule, InteractionModule],
    providers: [AiAgentService],
    exports: [AiAgentService],
})
export class AiAgentModule {}