import sys
import os

# Add project root directory to sys.path so backend module is discoverable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import uvicorn

if __name__ == "__main__":
    print("Starting Medora FastAPI Backend on http://127.0.0.1:8000 ...")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
