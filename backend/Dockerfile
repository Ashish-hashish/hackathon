FROM python:3.12-slim

WORKDIR /workspace

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy core package and install it
COPY core /workspace/core
RUN pip install --no-cache-dir -e /workspace/core

# Copy backend requirements and install
COPY backend/requirements.txt /workspace/backend/requirements.txt
RUN pip install --no-cache-dir -r /workspace/backend/requirements.txt

# Copy backend code
COPY backend /workspace/backend

# Copy sim code and set PYTHONPATH so sim package is importable
COPY sim /workspace/sim
ENV PYTHONPATH="/workspace:/workspace/backend:/workspace/core"

WORKDIR /workspace/backend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
