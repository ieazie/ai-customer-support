FROM node:20
LABEL authors="eazie.enibe"

# Set the working directory
WORKDIR /app

# Install dependencies for sequelize and postgres
#RUN apk add --no-cache bash

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy configuration files
COPY .sequelizerc .
COPY src/config/ ./config/
COPY migrations/ ./migrations/
COPY docker-entrypoint.sh .

# Set permissions
RUN chmod +x ./docker-entrypoint.sh

# Copy source code
COPY src/ ./src/
COPY tsconfig.json .

RUN npm run build

# Expose the backend port
EXPOSE 4000

# Run the backend application
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]