import secrets
import hashlib
from .models import ExtensionToken


def generate_token(user):
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    ExtensionToken.objects.update_or_create(user = user, defaults={'token_hash': token_hash} )
    return token
