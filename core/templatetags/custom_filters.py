from django import template
register = template.Library()

@register.filter
def mask_value(value):
    if not value:
        return ''
    else:
        return '**********'

