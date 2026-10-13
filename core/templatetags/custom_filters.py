from django import template
register = template.Library()

@register.filter
def mask_value(value):
    if not value:
        return ''
    else:
        return '**********'

@register.filter
def limit_100(value):
    if value:
        return str(value)[:100] + '....'
    else:
        return ''