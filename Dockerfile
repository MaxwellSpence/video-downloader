FROM python:3.12-slim

# Install system dependencies: ffmpeg, curl, unzip
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Deno for YouTube challenge solving
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Set working directory
WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Create downloads folder
RUN mkdir -p /app/downloads && chmod 777 /app/downloads

# Environment variables
ENV PORT=7860
ENV PYTHONUNBUFFERED=1

EXPOSE 7860

# Run with gunicorn
CMD ["sh", "-c", "gunicorn -w 2 --threads 4 -b 0.0.0.0:${PORT:-7860} --timeout 300 app:app"]
