# Docker Compose Management Makefile

# Environment
COMPOSE := docker-compose
SERVER_COMPOSE := -f ./server/docker-compose.server.yml
CLIENT_COMPOSE := -f ./client/docker-compose.client.yml
GLOBAL_COMPOSE := -f docker-compose.yml

# Targets
.PHONY: help server client global all down clean logs

help:
	@echo "Docker Compose Management"
	@echo "Usage:"
	@echo "  make server       Start server services"
	@echo "  make client      Start client services"
	@echo "  make global        Start full stack (server + client)"
	@echo "  make build         Build all services"
	@echo "  make down          Stop and remove containers"
	@echo "  make clean         Stop and remove containers, networks, volumes"
	@echo "  make logs          View service logs"
	@echo "  make help          Show this help"

## Backend Services
server-build:
	$(COMPOSE) $(SERVER_COMPOSE) build

server-up:
	$(COMPOSE) $(SERVER_COMPOSE) up

server-down:
	$(COMPOSE) $(SERVER_COMPOSE) down -v

## Frontend Services
client-build:
	$(COMPOSE) $(CLIENT_COMPOSE) build

client-up:
	$(COMPOSE) $(CLIENT_COMPOSE) up

client-down:
	$(COMPOSE) $(CLIENT_COMPOSE) down -v

## Full Stack
global-build: server-build client-build

global-up: server-up client-up

global-down: server-down client-down

## Combined Commands
build: global-build

up: global-up

down: global-down

clean:
	$(COMPOSE) $(GLOBAL_COMPOSE) down --volumes --rmi local --remove-orphans

logs:
	$(COMPOSE) $(GLOBAL_COMPOSE) logs -f

## Service Groups
all: build up