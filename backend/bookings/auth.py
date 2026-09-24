from django.contrib.auth import authenticate, get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from backend.bookings.models import UserProfile


User = get_user_model()


class AccountTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "username"

    def validate(self, attrs):
        identifier = (attrs.get("username") or "").strip()
        password = attrs.get("password")
        user = self._authenticate(identifier, password)
        if user is None:
            raise serializers.ValidationError("Tên đăng nhập/email hoặc mật khẩu không đúng.")

        self.user = user
        refresh = RefreshToken.for_user(user)
        data = {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }
        profile = UserProfile.objects.select_related("role", "organization").filter(
            user=user
        ).first()
        data["user"] = {
            "id": user.pk,
            "username": user.get_username(),
            "email": user.email,
            "name": user.get_full_name(),
            "role": profile.role.name if profile else None,
            "organization_id": profile.organization_id if profile else None,
            "must_change_password": profile.must_change_password if profile else False,
            "profile_completed": bool(profile and profile.profile_completed_at),
            "phone": profile.phone if profile else "",
        }
        return data

    def _authenticate(self, identifier, password):
        user = authenticate(
            request=self.context.get("request"),
            username=identifier,
            password=password,
        )
        if user is not None:
            return user

        candidates = User.objects.filter(username__iexact=identifier)
        if "@" in identifier:
            candidates = User.objects.filter(email__iexact=identifier)
        user = candidates.first()
        if user and user.is_active and user.check_password(password):
            return user
        return None

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        profile = UserProfile.objects.select_related("role").filter(user=user).first()
        token["role"] = profile.role.name if profile else None
        token["organization_id"] = profile.organization_id if profile else None
        token["must_change_password"] = (
            profile.must_change_password if profile else False
        )
        return token
