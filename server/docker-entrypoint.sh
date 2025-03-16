#!/bin/sh

# Run database migrations
echo "Running database migrations..."
npx sequelize-cli db:migrate

# Start the application
echo "Starting NestJS..."
exec "$@"