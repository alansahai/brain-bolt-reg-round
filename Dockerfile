FROM python:3.12-slim

WORKDIR /app

# Copy requirement definitions first for caching layer efficiency
COPY backend/requirements.txt backend/requirements.txt

# Install backend dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy source application, configuration, and data files
COPY backend backend
COPY config.yaml .
COPY data data

# Set default port environment variable fallback
ENV PORT=8080

# Command to run ASGI server
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
