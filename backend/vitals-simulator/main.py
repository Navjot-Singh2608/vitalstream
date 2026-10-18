r"""
Vitals simulator: pretends to be 24 bedside monitors.

Step 2: make up one reading per patient and print it.

Run from the backend folder:
    .venv\Scripts\python vitals-simulator\main.py
"""
import asyncio
import random
import json
import time

from aiokafka import AIOKafkaProducer

KAFKA_ADDRESS = "localhost:9094"
TOPIC = "vitals.raw"

# The 24 patient IDs: P-1001 ... P-1024
PATIENT_IDS = [f"P-{1000 + n}" for n in range(1, 25)]


def make_reading(patient_id: str) -> dict:
    """One made-up reading for one patient, with normal-ish values."""
    sbp = random.randint(110, 135)                      # top blood pressure
    return {
        "patientId": patient_id,
        "ts": int(time.time() * 1000),                  # now, in milliseconds
        # heart rate, beats per minute
        "hr": random.randint(60, 95),
        "spo2": random.randint(94, 99),                 # oxygen, %
        "sbp": sbp,
        # bottom blood pressure (always lower than top)
        "dbp": sbp - random.randint(35, 50),
        "rr": random.randint(12, 20),                   # breaths per minute
        "temp": round(random.uniform(36.3, 37.6), 1),   # temperature, °C
    }


async def main():
    producer = AIOKafkaProducer(bootstrap_servers=KAFKA_ADDRESS)
    await producer.start()
    print(
        f"Sending readings to Kafka topic '{TOPIC}' every second...")
    try:
        while True:                                  # forever, until Ctrl+C
            for pid in PATIENT_IDS:
                reading = make_reading(pid)
                await producer.send(
                    TOPIC,
                    json.dumps(reading).encode(),  # the reading as JSON bytes
                    key=pid.encode(),  # label = patient ID
                )
            print("sent 24 readings")
            await asyncio.sleep(1)                   # wait 1 second
    finally:
        await producer.stop()


asyncio.run(main())
