"""Print a password hash suitable for APP_PASSWORD_HASH.

Usage: python -m app.hash_password
"""

import getpass

from werkzeug.security import generate_password_hash

if __name__ == "__main__":
    pw = getpass.getpass("Passwort: ")
    print(generate_password_hash(pw))
