from django.db import models
from django.conf import settings
from cryptography.fernet import Fernet

cipher = Fernet(settings.ENCRIPTION_KEY_1)


# def user_avatar_path(instance, filename):
#     user_folder = instance.user.id
#     if user_folder is None:
#         user_folder = instance.user.email
#     return f'profile/{user_folder}/{filename}'

# class Profile(models.Model):
#     user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
#     avatar = models.ImageField(upload_to=user_avatar_path, blank=True, null=True)
#     timezone = models.CharField(max_length=150, default='UTC')
#     created_at = models.DateTimeField(auto_now_add=True)
#     updated_at = models.DateTimeField(auto_now=True)

#     def __str__(self):
#         return self.user.email

class ApiKey(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='api_key')
    name = models.CharField(max_length=150)
    key = models.CharField(max_length=1000)

    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        en_key = self._state.adding
        if not en_key:
            old_key = ApiKey.objects.filter(pk=self.pk).values_list('key', flat=True).first()
            en_key = old_key != self.key

        if self.key and en_key:
            raw_bytes = self.key.encode('utf-8')
            encrypted_bytes = cipher.encrypt(raw_bytes)
            self.key = encrypted_bytes.decode('utf-8')
        return super().save(*args, **kwargs)

    def get_decrypted_key(self):
        if not self.key:
            return '---'
        try:
            encrypted_bytes = self.key.encode('utf-8')
            decrypted_bytes = cipher.decrypt(encrypted_bytes)
            return decrypted_bytes.decode('utf-8')
        except Exception:
            return "Decryption failed (corrupted data or invalid key)"

    def __str__(self):
        return f"{self.user.email.split('@')[0]}: {self.name[:9]}"


# class Command(models.Model):
#     user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='commands')
#     command = models.CharField(max_length=150)
#     descreption = models.TextField()

#     updated_at = models.DateTimeField(auto_now=True)
#     created_at = models.DateTimeField(auto_now_add=True)

#     def __str__(self):
#         return f'{self.command}: {self.descreption[:10]}'

class ExtensionToken(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='extension_token')
    token_hash = models.CharField(max_length=556, unique=True)

    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f'Extension token for user {self.user_id}'

class Setting(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='setting')
    model = models.CharField(max_length=150, blank=True)
    trigger = models.CharField(max_length=25, default=';;')  

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.user.id}: {self.model}'  

