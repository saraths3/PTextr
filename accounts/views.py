from django.shortcuts import render, redirect
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.views.decorators.vary import vary_on_cookie
from django.views.decorators.cache import cache_control

@vary_on_cookie
@cache_control(private=True, no_store=True)
def LoignView(request):
    return render(request, 'accounts/login.html')

@vary_on_cookie
@cache_control(private=True, no_store=True)
@login_required(login_url='login')
def LogoutView(request):
    logout(request)
    return redirect('login')