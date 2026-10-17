# VitalStream backend (rebuilding step by step)

Kafka runs in Docker. Your Python services run directly on Windows with
**auto-reload**: save a file and the service restarts by itself.

## Every time you work on it

```powershell
cd D:\workstation\kafka-workstation\vitalStream\backend
powershell -ExecutionPolicy Bypass -File dev.ps1
```

That one command:
1. creates the Python environment the first time (`.venv`) and installs `requirements.txt`
2. starts Kafka + Kafka UI in Docker (`docker compose up -d`)
3. runs the patient service with `--reload` on http://localhost:8001

Edit `patient-service/main.py`, save, refresh the browser. No restart needed.

## Doing it by hand instead

```powershell
python -m venv .venv                      # once
.venv\Scripts\activate                    # every new terminal
pip install -r requirements.txt           # once, and after adding a library
docker compose up -d                      # start Kafka (once per session)
uvicorn main:app --reload --port 8001 --app-dir patient-service
```

## When you DO need to restart by hand
- you added a library to `requirements.txt` -> `pip install -r requirements.txt`, then restart
- you changed `docker-compose.yml` -> `docker compose up -d`

## Addresses
| What | Where |
|---|---|
| Patient service | http://localhost:8001/patients |
| Its API docs | http://localhost:8001/docs |
| Kafka UI | http://localhost:8080 |
| Kafka (for Python code) | `localhost:9094` |

## Steps
1. **Patient service with a hard-coded list** (done: `patient-service/main.py`)
2. Kafka on its own: look around in Kafka UI
3. Send the patient list to Kafka
4. Read it back in a second program
5. Send it to the dashboard over a WebSocket
