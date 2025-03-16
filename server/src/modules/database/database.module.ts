import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Interaction } from './models/interaction.model';
import { Session } from './models/session.model';

@Module({
    imports: [
        SequelizeModule.forRoot({
            dialect: 'postgres',
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT,10),
            username: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'strongpassword',
            database: process.env.DB_NAME || 'customer_support',
            models: [Session, Interaction],
            autoLoadModels: true,
            synchronize: false, // Use migrations instead
        }),
      SequelizeModule.forFeature([Session, Interaction]),
    ],
    exports: [SequelizeModule],
})
export class DatabaseModule {}