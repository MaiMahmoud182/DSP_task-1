# FROM: This tells Docker what base image to start with
# We're using Python 3.9 on a lightweight Linux (slim = smaller size)
FROM python:3.9-slim

# WORKDIR: Sets the working directory inside the container
# All subsequent commands will run from /app
WORKDIR /app

# RUN: Executes commands during the build process
# Here we're installing system-level dependencies needed for Python packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*
# gcc & g++: Compilers needed for some Python packages like numpy, scipy
# curl: Used for health checks
# rm -rf /var/lib/apt/lists/*: Cleans up to reduce image size

# COPY: Copies files from your computer into the container
# We copy requirements.txt FIRST (before other code) for better caching
# If requirements.txt doesn't change, Docker won't reinstall packages
COPY requirements.txt .

# RUN pip install: Installs all Python dependencies listed in requirements.txt
# --no-cache-dir: Doesn't save pip's cache (reduces image size)
RUN pip install --no-cache-dir -r requirements.txt

# COPY: Now we copy the rest of our application code
COPY . .

# RUN mkdir: Creates directories that our app needs
RUN mkdir -p uploads static/models

# Security: Create a non-root user and switch to it
# Running as root is dangerous; if someone hacks the container, they have full access
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# EXPOSE: Documents which port the container will listen on
# This doesn't actually open the port (that's done in docker-compose.yml)
EXPOSE 5000

# HEALTHCHECK: Tells Docker how to check if the container is healthy
# Every 30 seconds, Docker will run this command
# If it fails 3 times, Docker marks the container as unhealthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# CMD: The command that runs when the container starts
# This starts your Flask application
CMD ["python", "app.py"]