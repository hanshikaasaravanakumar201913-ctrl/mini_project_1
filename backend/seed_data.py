import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app.database import Base, SessionLocal, engine
from backend.app.seed_data import seed_demonstration_dataset
from backend.app.routes.c_engine import repopulate_c_structures

if __name__ == "__main__":
    print("==================================================")
    print("  Seeding Medora Demonstration Database")
    print("==================================================")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_demonstration_dataset(db, reset=True)
        stats = repopulate_c_structures(db)
        print("Database seeded with dynamic demonstration data:", stats)
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        db.close()
