# Use the official Node.js image
FROM node:20-bookworm

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json first to cache dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

RUN npx playwright install chromium --with-deps

# We don't need to COPY the rest of the code here because we are
# using volumes in docker-compose for live-reloading during development.

# Expose the Next.js default port
EXPOSE 3000

# Start the Next.js development server
CMD ["npm", "run", "dev"]