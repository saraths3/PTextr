from django.db import models
from django.conf import settings

def user_avatar_path(instance, filename):
    user_folder = instance.user.id
    if user_folder is None:
        user_folder = instance.user.email
    return f'profile/{user_folder}/{filename}'

class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    avatar = models.ImageField(upload_to=user_avatar_path, blank=True, null=True)
    timezone = models.CharField(max_length=150, default='UTC')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user.email
