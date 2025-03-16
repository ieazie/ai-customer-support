import { Controller, Get, Param } from '@nestjs/common';
import { InteractionService } from './interaction.service';

@Controller('interactions')
export class InteractionController {
  constructor(private interactionService: InteractionService) {}

  @Get()
  async getAllInteractions() {
    return this.interactionService.getAllInteractions();
  }

  @Get(':sessionId')
  async getInteractionsBySessionId(@Param('sessionId') sessionId: string) {
    return this.interactionService.getInteractionsBySessionId(sessionId);
  }
}