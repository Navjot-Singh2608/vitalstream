from fastapi import FastAPI

# ← the 24 patients now come from the other file
from patients_data import PATIENTS

app = FastAPI(title="Patient service")


@app.get("/patients")
async def list_patients():
    return PATIENTS
