from rest_framework import serializers

class TextProcessSerializer(serializers.Serializer):
    text = serializers.CharField()
    command = serializers.CharField()
    token = serializers.CharField(max_length=100)
