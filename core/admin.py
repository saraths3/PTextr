from django.contrib import admin
from .models import Profile, ApiKey, Command, Setting, ExtensionToken

admin.site.register([Profile, ApiKey, Command, Setting, ExtensionToken])