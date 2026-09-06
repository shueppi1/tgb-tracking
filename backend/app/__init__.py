from flask import Flask, jsonify
from pymongo import MongoClient
from werkzeug.exceptions import HTTPException

from .auth import bp as auth_bp
from .config import Config, resolve_password_hash
from .db import ensure_indexes
from .errors import Conflict, NotFound, ValidationError
from .events_catalog import load_catalog


def create_app(config: dict | None = None, db=None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if config:
        app.config.update(config)
    app.config["APP_PASSWORD_HASH_RESOLVED"] = resolve_password_hash(app.config)
    app.json.sort_keys = False

    if db is None:
        client = MongoClient(app.config["MONGO_URI"], tz_aware=True)
        db = client.get_default_database()
    app.extensions["mongo_db"] = db
    ensure_indexes(db)

    catalog = load_catalog(app.config.get("EVENTS_CATALOG_PATH") or None)
    app.extensions["catalog"] = catalog

    from .routes import exports, matches, players, stats

    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(players.bp, url_prefix="/api")
    app.register_blueprint(matches.bp, url_prefix="/api")
    app.register_blueprint(exports.bp, url_prefix="/api")
    app.register_blueprint(stats.bp, url_prefix="/api")

    @app.get("/api/health")
    def health():
        return jsonify(ok=True)

    @app.get("/api/event-types")
    def event_types():
        return jsonify(groups=catalog["groups"], events=catalog["events"])

    @app.errorhandler(ValidationError)
    def _validation(err):
        return jsonify(error=str(err)), 400

    @app.errorhandler(NotFound)
    def _not_found(err):
        return jsonify(error=str(err) or "Nicht gefunden."), 404

    @app.errorhandler(Conflict)
    def _conflict(err):
        return jsonify(error=str(err)), 409

    @app.errorhandler(HTTPException)
    def _http(err):
        return jsonify(error=err.description), err.code

    return app
