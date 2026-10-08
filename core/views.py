from django.shortcuts import render

# Create your views here.
from django.shortcuts import redirect, render, get_object_or_404
from django.contrib import messages
from django.contrib.auth.decorators import login_required

@login_required(login_url='login')
def HomeView(request):
    return render(request, 'core/home.html')

