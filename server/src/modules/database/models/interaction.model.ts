import { Table, Column, Model, BelongsTo, ForeignKey, DataType } from 'sequelize-typescript';

import { Session } from './session.model';

@Table
export class Interaction extends Model {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        primaryKey: true,
    })
    id: string;

    @ForeignKey(() => Session)
    @Column(DataType.STRING)
    sessionId: string;

    @BelongsTo(() => Session)
    session: Session[];

    @Column(DataType.STRING)
    customerText: string;

    @Column(DataType.STRING)
    aiResponse: string;

    @Column(DataType.JSONB)
    context: Record<string, any>;

    @Column(DataType.FLOAT)
    sentimentScore: number;

    @Column(DataType.STRING)
    voiceModelUsed: string;

    @Column({ type: DataType.DATE, defaultValue: DataType.DATE })
    timestamp: Date;
}
