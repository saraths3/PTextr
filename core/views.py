from django.shortcuts import render

# Create your views here.
from django.shortcuts import redirect, render, get_object_or_404
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from .forms import ProfileForm
from .models import Profile


@login_required(login_url='login')
def dashboard(request):
    profile, created = Profile.objects.select_related('user').get_or_create(user = request.user)
    form = ProfileForm(instance=profile)
    print(profile.avatar)
    if request.method == 'POST':
        form = ProfileForm( request.POST, request.FILES, instance = profile)
        if form.is_valid():
            form.save()
    return render(request, 'core/dashboard.html', {'form': form})

