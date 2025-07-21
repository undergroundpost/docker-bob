FROM node:18-alpine

# Install Chromium and all required dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    wqy-zenhei \
    dbus \
    dbus-x11 \
    && rm -rf /var/cache/apk/*

# Add a non-root user for better security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROMIUM_FLAGS="--no-sandbox --disable-dev-shm-usage"

WORKDIR /app

# Copy package files and install dependencies as root
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy application files
COPY . .

# Create data directory and set permissions
RUN mkdir -p data uploads && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]