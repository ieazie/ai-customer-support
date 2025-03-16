import {
    Table,
    Column,
    Model,
    HasMany,
    DataType,
} from 'sequelize-typescript';

import { Interaction } from './interaction.model';

@Table
export class Session extends Model{
    @Column({
        type: DataType.STRING,
        primaryKey: true,
    })
    id: string;

    @Column(DataType.DATE)
    startTime: Date;

    @Column({ allowNull: true, type: DataType.DATE })
    endTime: Date;

    @Column({ allowNull: true, type: DataType.FLOAT })
    duration: number; // in seconds

    @HasMany(() => Interaction)
    interactions: Interaction[];
}