import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';

import {InteractionService} from "./interaction.service";
import { Interaction } from '../database/models/interaction.model';
import {Session} from '../database/models/session.model';
import { InteractionController } from './interaction.controller';

@Module({
    imports: [
      SequelizeModule.forFeature([Interaction, Session]),
      ConfigModule
    ],
    providers: [InteractionService],
    controllers: [InteractionController],
    exports: [InteractionService],
})
export class InteractionModule {}