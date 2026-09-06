from flask import current_app
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import OperationFailure


def get_db():
    return current_app.extensions["mongo_db"]


def ensure_indexes(db) -> None:
    db.players.create_index([("position", ASCENDING), ("number", ASCENDING)])
    try:
        db.players.create_index(
            [("number", ASCENDING)],
            unique=True,
            partialFilterExpression={"active": True},
            name="unique_active_number",
        )
    except OperationFailure:
        # Older servers / mongomock: uniqueness is also enforced in the players route.
        pass
    db.matches.create_index([("status", ASCENDING), ("kickoff", DESCENDING)])
    db.matches.create_index([("season", ASCENDING), ("kickoff", DESCENDING)])
