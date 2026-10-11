from django.contrib import admin
from .models import Profile, ApiKey, Commands

# Register your models here.
admin.site.register([Profile, ApiKey, Commands])