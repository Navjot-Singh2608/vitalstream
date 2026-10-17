"""
Sends all 24 patients into Kafka, one message per patient.

Run from the backend folder:
    .venv\Scripts\python patient-service\send_patients.py
"""

import asyncio                          # lets Python wait for Kafka without freezing
import json                             # turns a Python dict into JSON text

# the Kafka "sender" from the aiokafka library
from aiokafka import AIOKafkaProducer

from patients_data import PATIENTS      # our 24 patients from step 1

# where Kafka listens for programs on your PC
KAFKA_ADDRESS = "localhost:9094"
TOPIC = "patients"                      # the name of the box we put patients into


async def main():
    # 1. Create the sender and tell it where Kafka is
    producer = AIOKafkaProducer(bootstrap_servers=KAFKA_ADDRESS)

    # 2. Connect to Kafka
    await producer.start()

    try:
        # 3. Send each patient as one message
        for patient in PATIENTS:
            # dict → JSON text → bytes (Kafka stores bytes)
            value = json.dumps(patient).encode()
            key = patient["id"].encode()           # the label, e.g. b"P-1002"

            # send, and wait until Kafka says "saved"
            await producer.send_and_wait(TOPIC, value, key=key)
            print("sent", patient["id"], patient["name"])
    finally:
        # 4. Always disconnect at the end, even if something went wrong
        await producer.stop()

    print("Done: all patients are in Kafka.")


asyncio.run(main())                     # start the async main() function
