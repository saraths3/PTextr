from django.shortcuts import render, redirect
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required

def LoignView(request):
    return render(request, 'accounts/login.html')

@login_required(login_url='login')
def LogoutView(request):
    logout(request)
    return redirect('home')