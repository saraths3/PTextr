from django import forms
from .models import ApiKey

class APIUForm(forms.ModelForm):
    class Meta:
        model = ApiKey
        fields = ['name', 'key']

        widgets = {
            'key' : forms.PasswordInput        
            }