r"""
Risk scorer: reads raw readings, adds a NEWS2 danger score + risk level, sends them on.

    reads   "vitals.raw"       (from the vitals simulator)
    writes  "vitals.enriched"  (read by stream-gateway)

Run from the backend folder:
    .venv\Scripts\python risk-scorer\main.py
"""

import asyncio
import json

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

KAFKA_ADDRESS = "localhost:9094"
IN_TOPIC = "vitals.raw"
OUT_TOPIC = "vitals.enriched"
GROUP = "risk-scorer"               # the consumer group (team) name

INF = float("inf")

# NEWS2 (simplified): for each vital, (upper limit, points). Checked from top to bottom.
BANDS = {
    "rr":   [(8, 3), (11, 1), (20, 0), (24, 2), (INF, 3)],
    "spo2": [(91, 3), (93, 2), (95, 1), (INF, 0)],
    "sbp":  [(90, 3), (100, 2), (110, 1), (219, 0), (INF, 3)],
    "hr":   [(40, 3), (50, 1), (90, 0), (110, 1), (130, 2), (INF, 3)],
    "temp": [(35.0, 3), (36.0, 1), (38.0, 0), (39.0, 1), (INF, 2)],
}


def points(value: float, bands: list) -> int:
    """How many points one vital sign gets."""
    for upper, pts in bands:
        if value <= upper:
            return pts
    return 0


def score(reading: dict) -> tuple[int, str]:
    """Total NEWS2 score and the risk level for one reading."""
    parts = [points(reading[name], BANDS[name]) for name in BANDS]
    total = sum(parts)
    if total >= 7:
        risk = "critical"
    elif total >= 5 or 3 in parts:      # 3 points on any single vital is also serious
        risk = "urgent"
    elif total >= 3:
        risk = "watch"
    else:
        risk = "stable"
    return total, risk


async def main():
    consumer = AIOKafkaConsumer(
        IN_TOPIC,
        bootstrap_servers=KAFKA_ADDRESS,
        # join the "risk-scorer" team: Kafka remembers how far we got
        group_id=GROUP,
        # first time ever: start with NEW readings, skip the old pile
        auto_offset_reset="latest",
        metadata_max_age_ms=3000,
    )
    producer = AIOKafkaProducer(bootstrap_servers=KAFKA_ADDRESS)
    await consumer.start()
    await producer.start()
    print(f"Risk scorer: '{IN_TOPIC}' -> '{OUT_TOPIC}'... (Ctrl+C to stop)")

    count = 0
    try:
        async for msg in consumer:                       # one raw reading at a time
            reading = json.loads(msg.value)
            total, risk = score(reading)
            reading["news2"] = total                     # add the score
            reading["risk"] = risk                       # add the risk level
            await producer.send(OUT_TOPIC, json.dumps(reading).encode(), key=msg.key)
            count += 1
            if count % 240 == 0:                         # print about every 10 seconds, not every message
                print(f"scored {count} readings so far")
    finally:
        await consumer.stop()
        await producer.stop()


asyncio.run(main())
