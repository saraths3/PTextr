from django.urls import path
from .views import LoignView, LogoutView

urlpatterns = [
    path('login/', LoignView, name='login'),
    path('logout/', LogoutView, name='logout')
]