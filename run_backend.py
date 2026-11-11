import os
import sys

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import uvicorn

if __name__ == "__main__":
    print("==================================================")
    print("  Starting Medora FastAPI Server")
    print("  API Docs : http://127.0.0.1:8000/docs")
    print("  Health   : http://127.0.0.1:8000/api/health")
    print("==================================================")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
