from django.contrib import admin
from .models import ApiKey, Setting, ExtensionToken

admin.site.register([ ApiKey, Setting, ExtensionToken])