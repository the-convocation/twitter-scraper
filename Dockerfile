# Use Node.js 20 LTS
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Enable Corepack for Yarn management
RUN corepack enable

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./

# Install dependencies
RUN yarn install --immutable

# Copy source code
COPY . .

# Build the project
RUN yarn build
RUN yarn build:monitor

# Default: run the monitor
CMD ["yarn", "monitor"]
