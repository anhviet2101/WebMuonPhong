from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth import get_user_model, password_validation
from rest_framework import serializers

from backend.bookings.models import (
    AuditLog,
    Booking,
    BookingApproval,
    Building,
    BusinessRuleConfig,
    Campus,
    Organization,
    Permission,
    Role,
    RolePermission,
    Room,
    RoomBlackout,
    UserProfile,
)
from backend.bookings.permissions import get_user_organization_id, is_admin


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "abbreviation",
            "type",
            "representative_name",
            "hotline",
            "contact_email",
            "fanpage_url",
            "active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "name", "description"]
        read_only_fields = ["id"]


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "key", "description"]
        read_only_fields = ["id"]


class RolePermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RolePermission
        fields = ["id", "role", "permission"]
        read_only_fields = ["id"]


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ["id", "user", "role", "organization", "must_change_password"]
        read_only_fields = ["id"]


User = get_user_model()


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value


class UserAdminSerializer(serializers.ModelSerializer):
    role = serializers.CharField(write_only=True, required=False)
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.filter(active=True),
        required=False,
        allow_null=True,
    )
    password = serializers.CharField(write_only=True, required=False)
    must_change_password = serializers.BooleanField(required=False)
    role_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "is_active",
            "role", "role_name", "organization", "password", "must_change_password",
        ]
        read_only_fields = ["id", "role_name"]

    def get_role_name(self, obj):
        profile = getattr(obj, "booking_profile", None)
        return profile.role.name if profile else None

    def validate_role(self, value):
        if not Role.objects.filter(name=value).exists():
            raise serializers.ValidationError("Role không tồn tại.")
        return value

    def create(self, validated_data):
        role_name = validated_data.pop("role", "CLB_REP")
        password = validated_data.pop("password", None)
        must_change = validated_data.pop("must_change_password", bool(password))
        organization = validated_data.pop("organization", None)
        if not password:
            raise serializers.ValidationError({"password": "Trường này là bắt buộc."})
        user = User.objects.create_user(password=password, **validated_data)
        UserProfile.objects.create(
            user=user,
            role=Role.objects.get(name=role_name),
            organization=organization,
            must_change_password=must_change,
        )
        return user

    def update(self, instance, validated_data):
        role_name = validated_data.pop("role", None)
        password = validated_data.pop("password", None)
        must_change = validated_data.pop("must_change_password", None)
        organization = validated_data.pop("organization", serializers.empty)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        profile, _ = UserProfile.objects.get_or_create(
            user=instance, defaults={"role": Role.objects.get(name=role_name or "CLB_REP")}
        )
        if role_name:
            profile.role = Role.objects.get(name=role_name)
        if organization is not serializers.empty:
            profile.organization = organization
        if must_change is not None:
            profile.must_change_password = must_change
        profile.save()
        return instance


class CampusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campus
        fields = ["id", "name", "code", "address", "active"]
        read_only_fields = ["id"]


class BuildingSerializer(serializers.ModelSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    campus_code = serializers.CharField(source="campus.code", read_only=True)

    class Meta:
        model = Building
        fields = [
            "id",
            "campus",
            "campus_name",
            "campus_code",
            "name",
            "floor_count",
            "active",
            "operating_hours_start",
            "operating_hours_end",
        ]
        read_only_fields = ["id", "campus_name", "campus_code"]


class RoomSerializer(serializers.ModelSerializer):
    building_name = serializers.CharField(source="building.name", read_only=True)
    campus_id = serializers.IntegerField(source="building.campus_id", read_only=True)
    campus_name = serializers.CharField(source="building.campus.name", read_only=True)
    campus_code = serializers.CharField(source="building.campus.code", read_only=True)

    class Meta:
        model = Room
        fields = [
            "id",
            "building",
            "building_name",
            "campus_id",
            "campus_name",
            "campus_code",
            "name",
            "floor",
            "capacity",
            "type",
            "has_projector",
            "has_microphone",
            "has_ac",
            "has_whiteboard",
            "has_sound_system",
            "rentable",
            "buffer_before_minutes",
            "buffer_after_minutes",
            "notes",
            "active",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "building_name",
            "campus_id",
            "campus_name",
            "campus_code",
            "created_at",
        ]


class BookingSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True)
    campus_id = serializers.IntegerField(source="room.building.campus_id", read_only=True)
    building_id = serializers.IntegerField(source="room.building_id", read_only=True)
    created_by_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id",
            "organization",
            "organization_name",
            "room",
            "room_name",
            "secondary_room",
            "activity_name",
            "description",
            "participant_count",
            "contact_person",
            "contact_phone",
            "contact_email",
            "start_time",
            "end_time",
            "setup_time_minutes",
            "teardown_time_minutes",
            "equipment_request",
            "notes",
            "status",
            "physical_status",
            "scan_file_url",
            "physical_submitted_at",
            "physical_confirmed_at",
            "physical_confirmed_by",
            "hold_expires_at",
            "campus_id",
            "building_id",
            "created_by_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization_name",
            "room_name",
            "status",
            "physical_status",
            "scan_file_url",
            "physical_submitted_at",
            "physical_confirmed_at",
            "physical_confirmed_by",
            "hold_expires_at",
            "campus_id",
            "building_id",
            "created_by_id",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if request and not is_admin(user):
            organization_id = get_user_organization_id(user)
            if organization_id is None:
                raise serializers.ValidationError(
                    "Tài khoản CLB chưa được gắn organization."
                )
            attrs["organization_id"] = organization_id

        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start_time and end_time and start_time >= end_time:
            raise serializers.ValidationError(
                {"end_time": "Thời gian kết thúc phải sau thời gian bắt đầu."}
            )

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        booking = Booking(created_by=request.user, **validated_data)
        try:
            booking.full_clean()
            booking.save()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages) from exc
        return booking


class BookingActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ChangeRoomSerializer(BookingActionSerializer):
    new_room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.all())


class UploadScanSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, file):
        extension = "." + file.name.rsplit(".", 1)[-1].lower()
        if extension not in {".jpg", ".jpeg", ".png", ".pdf"}:
            raise serializers.ValidationError(
                "File bản scan phải có định dạng .jpg, .jpeg, .png hoặc .pdf."
            )

        if file.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("File bản scan không được vượt quá 10MB.")

        return file


class BookingApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingApproval
        fields = ["id", "booking", "approver", "decision", "comment", "created_at"]
        read_only_fields = ["id", "created_at"]


class RoomBlackoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomBlackout
        fields = [
            "id",
            "scope_type",
            "room_ids",
            "building",
            "floor",
            "start_time",
            "end_time",
            "is_recurring",
            "recurrence_rule",
            "reason",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["id", "created_by", "created_at"]


class BusinessRuleConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessRuleConfig
        fields = ["key", "value", "description", "updated_by", "updated_at"]
        read_only_fields = ["updated_by", "updated_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id",
            "user",
            "action",
            "entity_type",
            "entity_id",
            "old_value",
            "new_value",
            "created_at",
        ]
        read_only_fields = fields
