class ValidationError(ValueError):
    """Raised for invalid client input; rendered as a 400 JSON response."""


class NotFound(LookupError):
    """Raised when a referenced document does not exist; rendered as 404."""


class Conflict(RuntimeError):
    """Raised when the operation is not allowed in the current state; rendered as 409."""
