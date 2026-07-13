# Use official Node.js 18 Alpine image (small size)
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files first (Docker caching optimization)
COPY package*.json ./

# Install production dependencies only
RUN npm install --production

# Copy all source code
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the server
CMD ["node", "src/server.js"]