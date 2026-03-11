FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ws_monitor.py .
COPY assets_config.json .

CMD ["python", "ws_monitor.py"]

