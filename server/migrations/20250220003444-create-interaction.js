'use strict';

const { DataTypes } = require('sequelize');
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    await queryInterface.createTable('Interactions', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      sessionId: {
        type: DataTypes.STRING,
        references: {
          model: 'Sessions',
          key: 'id',
        },
      },
      customerText: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      aiResponse: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      context: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      sentimentScore: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      voiceModelUsed: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.DATE,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addConstraint('Interactions', {
      fields: ['sessionId'],
      type: 'foreign key',
      name: 'fk_session_id',
      references: {
        table: 'Sessions',
        field: 'id'
      },
      onDelete: 'cascade',
      onUpdate: 'cascade'
    });

  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeConstraint('Interactions', 'fk_session_id');
    await queryInterface.dropTable('Interactions');
  }
};
