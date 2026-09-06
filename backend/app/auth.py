from functools import wraps

from flask import Blueprint, current_app, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash

bp = Blueprint("auth", __name__)


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="tgb-auth-token")


def issue_token() -> str:
    return _serializer().dumps({"v": 1})


def verify_token(token: str) -> bool:
    try:
        _serializer().loads(token, max_age=current_app.config["TOKEN_MAX_AGE"])
    except (BadSignature, SignatureExpired):
        return False
    return True


@bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    password = data.get("password", "")
    pw_hash = current_app.config.get("APP_PASSWORD_HASH_RESOLVED", "")
    if not pw_hash:
        return jsonify(error="Kein Passwort konfiguriert (APP_PASSWORD_HASH)."), 503
    if not isinstance(password, str) or not check_password_hash(pw_hash, password):
        return jsonify(error="Falsches Passwort."), 401
    return jsonify(token=issue_token())


@bp.get("/auth/check")
def check():
    return jsonify(ok=_authorized())


def _authorized() -> bool:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return False
    return verify_token(header[7:].strip())


def require_auth():
    """before_request hook: reject unauthenticated requests with 401."""
    if request.method == "OPTIONS":
        return None
    if not _authorized():
        return jsonify(error="Nicht angemeldet."), 401
    return None


def protect(blueprint: Blueprint) -> Blueprint:
    blueprint.before_request(require_auth)
    return blueprint


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        rejected = require_auth()
        if rejected is not None:
            return rejected
        return fn(*args, **kwargs)

    return wrapper
