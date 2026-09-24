FROM python:3.12-slim

# Install system dependencies: ffmpeg, curl, unzip, ca-certificates
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

# Install bgutil-pot for YouTube Proof-of-Origin (PO) Token generation
RUN curl -fsSL -o /usr/local/bin/bgutil-pot https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/download/v0.8.1/bgutil-pot-linux-x86_64 \
    && chmod +x /usr/local/bin/bgutil-pot

# Set working directory
WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .
RUN cp -r yt_dlp_plugins /usr/local/lib/python3.12/site-packages/

# Create downloads folder
RUN mkdir -p /app/downloads && chmod 777 /app/downloads

# Environment variables
ENV PORT=7860
ENV PYTHONUNBUFFERED=1

EXPOSE 7860

# Run bgutil-pot server on 127.0.0.1:4416 in background and gunicorn in foreground
CMD ["sh", "-c", "bgutil-pot server --host 127.0.0.1 --port 4416 & sleep 1 && gunicorn -w 2 --threads 4 -b 0.0.0.0:${PORT:-7860} --timeout 300 app:app"]
