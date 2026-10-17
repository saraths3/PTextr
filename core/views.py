from django.shortcuts import render

# Create your views here.
from django.shortcuts import redirect, render, get_object_or_404
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from .models import ApiKey, Setting
from .form import APIUForm
from google import genai
from google.genai.errors import APIError
from .utils import generate_token


@login_required(login_url='login')
def dashboard(request):
    email = request.user.email
    username = email.split('@')[0]
    token=False
    if request.method == 'POST':
        token = generate_token(request.user)
    context = {
        'username' : username,
    }
    if token:
        context['token'] = token
    return render(request, 'core/dashboard.html', context)

@login_required(login_url='login')
def api_keys(request):
    if request.method == 'POST':
        user = request.user
        name = request.POST.get('key-name', '').strip()
        key = request.POST.get('api-key', '').strip()
        if request.user.is_authenticated:
            if name and key:
                ApiKey.objects.create(user=user, name=name, key=key)
                messages.success(request, f'{name} Key Added.')
                return redirect('api-keys')

    active_keys = ApiKey.objects.filter(user=request.user, is_active=True).order_by('-id')
    inactive_keys = ApiKey.objects.filter(user=request.user, is_active=False).order_by('-id')

    context = {
        'active_keys': active_keys,
        'inactive_keys': inactive_keys,
    }
    return render(request, 'core/api-keys.html', context)

@login_required(login_url='login')
def remove_key(request, key_id):
    key = get_object_or_404(ApiKey, id=key_id, user=request.user)
    if request.method == 'POST':
        messages.success(request, f'{key.name} removed successfully.')
        key.delete()
    return redirect('api-keys')

@login_required(login_url='login')
def key_actions(request, key_id):
    key = get_object_or_404(ApiKey, id=key_id, user=request.user)
    if request.method == 'POST':
        if key.is_active:
            key.is_active = False
            key.save()
            messages.success(request, f'{key.name} is Deactivated.')
            return redirect('api-keys')
        else:
            key.is_active = True
            activated_keys = ApiKey.objects.filter(user=request.user ,is_active=True)
            for ak in activated_keys:
                ak.is_active = False
                ak.save()
            key.save()

            messages.success(request, f'{key.name} is Activated.')
            return redirect('api-keys')
    return redirect('api-keys')

@login_required(login_url='login')
def update_key(request, key_id):
    api_key = get_object_or_404(ApiKey, id=key_id, user=request.user)
    if request.method == 'POST':
        form=APIUForm(request.POST, instance=api_key)
        if form.is_valid():
            form.save()
            messages.success(request, f'{api_key} Updated.')
            return redirect('api-keys')
    form = APIUForm(instance=api_key)
    form.fields['key'].initial = ''
    return render(request, 'core/update_key.html', {'form': form})

@login_required(login_url='login')
def unmask_key(request, key_id):
    if request.method == 'POST':
        key = get_object_or_404(ApiKey, id = key_id, user = request.user)
        key = key.get_decrypted_key()
        return render(request, 'core/unmask_key.html', {'key': key})
    return redirect('api-keys')


@login_required(login_url='login')
def settings(request):
    setting = Setting.objects.filter(user=request.user).first()
    key = ApiKey.objects.filter(is_active=True, user=request.user).first()
    if not key:
        messages.error(request, 'Add and active and API Key')
        return redirect('api-keys')
    model_data = []
    EXCLUDE_WORDS = ['preview', 'tts', 'transcribe', 'image', 'nano', 'banana', 'omni', 'pro', 'gemini-2']
    if key:
        try:
            client = genai.Client(api_key=key.get_decrypted_key())
            for m in client.models.list():
                model_name = m.name
                if 'generateContent' in m.supported_actions:
                    if (
                        'gemini' in model_name
                        and 'flash' in model_name
                        and not any(kw in model_name for kw in EXCLUDE_WORDS)
                    ):
                        model_data.append(model_name.replace('models/', ''))
        except APIError as e:
            messages.error(request, f'Check your API Key, ACTIVE API KEY ERROR: {e}')
            return redirect('api-keys')
        except Exception as e:
            messages.error(request, f'An unexpected error occurred: {e}')
            return redirect('api-keys')
    else:
        messages.warning(request, 'Please configure and activate an API key first.')
    if request.method == 'POST':
        selected_model = request.POST.get('model')
        selected_trigger = request.POST.get('flag', ';;')
        if selected_model in model_data:
            setting, created = Setting.objects.update_or_create(
                user=request.user,
                defaults={
                    'model': selected_model,
                    'trigger': selected_trigger
                }
            )
            messages.success(request, 'Settings saved successfully!')
            return redirect('settings')
        else:
            messages.error(request, 'Invalid model selection.')

    context = {
        'model_data': model_data,
        'setting': setting,
    }
    return render(request, 'core/settings.html', context)
