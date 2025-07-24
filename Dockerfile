# Multi-stage build for optimal image size
FROM rust:1.88-slim-bookworm AS builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Create dummy main.rs to build dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies (this is cached when source code changes)
RUN cargo build --release && rm src/main.rs target/release/deps/crm_rust*

# Copy source code
COPY src ./src

# Build application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -r -s /bin/false -m -d /app crm

# Copy binary from builder stage
COPY --from=builder /app/target/release/crm-rust /app/crm-rust

# Create necessary directories
RUN mkdir -p /app/public && chown -R crm:crm /app

# Switch to app user
USER crm
WORKDIR /app

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/metadata || exit 1

# Run the application
CMD ["./crm-rust"]