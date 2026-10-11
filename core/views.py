from django.shortcuts import render

# Create your views here.
from django.shortcuts import redirect, render, get_object_or_404
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from .models import ApiKey, Commands
from .form import APIUForm


@login_required(login_url='login')
def dashboard(request):
    email = request.user.email
    username = email.split('@')[0]
    return render(request, 'core/dashboard.html', {'username': username})

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
def commands(request):

    if request.method == 'POST':
        command = request.POST.get('command-name', '').strip()
        description = request.POST.get('commad-description', '').strip()
        Commands.objects.create(user = request.user, command = command, descreption = description)

    all_commands = Commands.objects.filter(user = request.user)
    context = {
        'all_commands': all_commands
    }

    return render(request, 'core/commands.html', context)

@login_required(login_url='login')
def update_command(request, c_id):
    if request.method == 'POST':
        command = request.POST.get('command', '').strip()
        description = request.POST.get('descreption', '').strip()
        command_ = get_object_or_404(Commands, id = c_id)
        command_.command = command
        command_.descreption = description
        command_.save()
        messages.success(request, f'{command} updated.')
    return redirect('commands')

@login_required(login_url='login')
def delete_command(request, c_id):
    if request.method == 'POST':
        command = get_object_or_404(Commands, id = c_id, user = request.user)
        messages.success(request, f'{command.command} deleted.')
        command.delete()
    return redirect('commands')