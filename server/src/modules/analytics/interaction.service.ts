import { Injectable, Inject } from '@nestjs/common';
import { Interaction } from '../database/models/interaction.model';
import { Session } from '../database/models/session.model';
import { InjectModel } from '@nestjs/sequelize';


@Injectable()
export class InteractionService {
    constructor(
        @InjectModel(Interaction)
        private interactionRepository: typeof Interaction,
        @InjectModel(Session)
        private sessionRepository: typeof Session,
    ) {}

    async logInteraction(data: {
        sessionId: string;
        customerText: string;
        aiResponse: string;
        sentimentScore: number;
        context: any;
        voiceModelUsed: string;
    }) {
        let session = await this.sessionRepository.findOne<Session>({ where: { id: data.sessionId }});

        if (!session) {
            session = await this.sessionRepository.create({
                id: data.sessionId,
                startTime: new Date(),
            });
            // await this.sessionRepository.save(session);
        }

        await this.interactionRepository.create({
            sessionId: session.id,
            customerText: data.customerText,
            aiResponse: data.aiResponse,
            sentimentScore: data.sentimentScore,
            context: data.context,
            voiceModelUsed: data.voiceModelUsed,
            timestamp: new Date(),
        });

        // await this.interactionRepository.save(interaction);
    }

    async getAllInteractions(): Promise<Interaction[]> {
        return this.interactionRepository.findAll<Interaction>({
            order: [['timestamp', 'DESC']]
        });
    }

    async getInteractionsBySessionId(sessionId: string): Promise<Interaction[]> {
        return this.interactionRepository.findAll<Interaction>({
            where: { id: sessionId },
            order: [['timestamp', 'DESC']]
        });
    }

    async finalizeSession(sessionId: string): Promise<void> {
        const session = await this.sessionRepository.findOne<Session>({
            where: { id: sessionId },
            rejectOnEmpty: false
        });
        if (session) {
            session.endTime = new Date();
            session.duration = (session.endTime.getTime() - session.startTime.getTime()) / 1000;
            
            await this.sessionRepository.upsert({
                id: session.id,
                startTime: session.startTime,
                endTime: session.endTime,
                duration: session.duration
            });
        }
    }
}