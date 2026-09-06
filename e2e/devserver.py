"""Runs the real Flask app against an in-memory mongomock database.

Handy for the E2E smoke test or for trying the UI without MongoDB/Docker:

    pip install -r ../backend/requirements-dev.txt
    python devserver.py            # API on http://127.0.0.1:5000, password "geheim"

Everything except persistence is the production code path.
"""

import sys
from pathlib import Path


def build_app():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    import mongomock

    from app import create_app

    db = mongomock.MongoClient(tz_aware=True)["tgb_e2e"]
    return create_app({"APP_PASSWORD": "geheim", "SECRET_KEY": "e2e-secret"}, db=db)


app = build_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, threaded=True)
