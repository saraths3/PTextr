from django.urls import path
from .views import dashboard, api_keys, remove_key, key_actions, update_key,unmask_key , commands


urlpatterns = [
    path('', dashboard, name='dashboard'),
    path('api-keys/', api_keys, name='api-keys'),
    path('api-keys/delete<int:key_id>', remove_key, name='remove_key'),
    path('api-keys/action<int:key_id>', key_actions, name='key_actions'),
    path('api-keys/update<int:key_id>', update_key, name='update_key'),
    path('unmask_key/<int:key_id>', unmask_key, name='unmask_key'),
    path('commands/', commands, name='commands'),
]