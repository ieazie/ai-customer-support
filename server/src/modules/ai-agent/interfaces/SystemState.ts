export interface SystemState {
    requiresHumanHandoff: boolean;
    activeProcesses: string[];
    lastAction?: AgentAction;
}

export interface AgentAction {
    type: 'transfer' | 'knowledge_lookup' | 'confirmation';
    payload?: any;
}