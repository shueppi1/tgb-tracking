import os

from werkzeug.security import generate_password_hash


class Config:
    MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/tgb")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    # Preferred: a werkzeug hash (see `python -m app.hash_password`).
    APP_PASSWORD_HASH = os.environ.get("APP_PASSWORD_HASH", "")
    # Convenience for local development: a plain password that is hashed at startup.
    APP_PASSWORD = os.environ.get("APP_PASSWORD", "")
    TOKEN_MAX_AGE = int(os.environ.get("TOKEN_MAX_AGE", str(60 * 60 * 24 * 30)))
    EVENTS_CATALOG_PATH = os.environ.get("EVENTS_CATALOG_PATH", "")


def resolve_password_hash(config: dict) -> str:
    if config.get("APP_PASSWORD_HASH"):
        return config["APP_PASSWORD_HASH"]
    if config.get("APP_PASSWORD"):
        return generate_password_hash(config["APP_PASSWORD"])
    return ""
