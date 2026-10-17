r"""
Stream gateway (Live Feed).

1. In the background: reads patients from the Kafka topic "patients"
   and keeps the newest copy of each patient.
2. WebSocket /ws/stream: every browser that connects gets the full patient
   list straight away, and again every time a patient message arrives.

Run from the backend folder:
    .venv\Scripts\python -m uvicorn main:app --reload --port 8000 --app-dir stream-gateway
"""

import asyncio
import json
import time
from contextlib import asynccontextmanager

from aiokafka import AIOKafkaConsumer
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

KAFKA_ADDRESS = "localhost:9094"
TOPIC = "patients"

# newest copy of each patient, by ID: {"P-1001": {...}, ...}
patients: dict[str, dict] = {}
browsers: set[WebSocket] = set()   # every browser that is connected right now


def patient_list_message() -> dict:
    """The message the dashboard expects: {topic, ts, payload}."""
    return {
        # what kind of message
        "topic": "patients.all-list",
        # when (milliseconds)
        "ts": int(time.time() * 1000),
        # the patients, in bed order
        "payload": sorted(patients.values(), key=lambda p: p["bed"]),
    }


async def send_to_all_browsers(message: dict) -> None:
    for ws in list(browsers):
        try:
            await ws.send_json(message)
        except Exception:
            browsers.discard(ws)          # that browser has gone; forget it


async def read_patients_from_kafka() -> None:
    """The same loop as read_patients.py, but it saves and forwards instead of printing."""
    consumer = AIOKafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_ADDRESS,
        auto_offset_reset="earliest",
        metadata_max_age_ms=3000,
    )
    await consumer.start()
    print(f"Reading topic '{TOPIC}' from Kafka...")
    try:
        async for msg in consumer:
            patient = json.loads(msg.value)
            # same ID again? it simply replaces the old copy
            patients[patient["id"]] = patient
            await send_to_all_browsers(patient_list_message())
    finally:
        await consumer.stop()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # start reading Kafka in the background
    task = asyncio.create_task(read_patients_from_kafka())
    yield                                                    # the service runs here
    # stop reading when the service stops
    task.cancel()


app = FastAPI(title="Stream gateway", lifespan=lifespan)


@app.websocket("/ws/stream")
async def stream(ws: WebSocket):
    await ws.accept()                       # a browser connected: pick up the phone
    browsers.add(ws)
    print(f"Browser connected ({len(browsers)} open)")
    try:
        # send the current list straight away
        await ws.send_json(patient_list_message())
        while True:
            # keep the line open until the browser leaves
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        browsers.discard(ws)
        print(f"Browser disconnected ({len(browsers)} open)")
