import { Module } from '@nestjs/common';

import { SessionManagerService } from './session-manager.service';
import { SessionStateMachine} from './session-state.machine';

@Module({
    providers: [SessionManagerService, SessionStateMachine],
    exports: [SessionManagerService, SessionStateMachine],
})

export class SessionManagerModule {}