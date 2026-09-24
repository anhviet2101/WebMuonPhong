
from copy import copy
from uuid import uuid4
import re
from django.http import HttpResponse
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import mixins, status, viewsets
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils.crypto import get_random_string

from backend.bookings.models import (
    AuditLog,
    Booking,
    BookingStatus,
    Building,
    BusinessRuleConfig,
    BorrowingPolicy,
    Campus,
    DocumentTemplate,
    Notification,
    PhysicalStatus,
    Room,
    RoomBlackout,
)
from backend.bookings.permissions import (
    AdminWriteOrReadOnly,
    BookingObjectPermission,
    HasPermission,
    IsAdminRole,
    filter_bookings_for_user,
    get_user_organization_id,
    is_admin,
    is_clb_rep,
    user_has_permission,
)
from backend.bookings.serializers import (
    BookingActionSerializer,
    BookingSerializer,
    BuildingSerializer,
    CampusSerializer,
    ChangeRoomSerializer,
    RoomBlackoutSerializer,
    RoomSerializer,
    ChangePasswordSerializer,
    OrganizationSerializer,
    UserAdminSerializer,
    AuditLogSerializer,
    BusinessRuleConfigSerializer,
    BorrowingPolicySerializer,
    DocumentTemplateSerializer,
    NotificationSerializer,
)
from backend.bookings.auth import AccountTokenObtainPairSerializer
from backend.bookings.models import Organization, UserProfile
from backend.bookings.services import booking_service


CONFLICT_STATUSES = [
    BookingStatus.PENDING_HOLD.value,
    BookingStatus.APPROVED.value,
    BookingStatus.ROOM_CHANGED.value,
]

User = get_user_model()


class AccountTokenObtainPairView(TokenObtainPairView):
    serializer_class = AccountTokenObtainPairSerializer


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data["old_password"]):
            raise ValidationError({"old_password": "Mật khẩu hiện tại không đúng."})
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        profile = UserProfile.objects.filter(user=request.user).first()
        if profile:
            profile.must_change_password = False
            profile.save(update_fields=["must_change_password"])
        refresh = RefreshToken.for_user(request.user)
        return Response({"refresh": str(refresh), "access": str(refresh.access_token)})


class OrganizationProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization = _user_organization(request.user)
        if not organization:
            raise ValidationError("Tài khoản chưa được gắn organization.")
        return Response(OrganizationSerializer(organization).data)

    def patch(self, request):
        organization = _user_organization(request.user)
        if not organization or not is_clb_rep(request.user):
            raise PermissionDenied("Chỉ đại diện CLB được cập nhật hồ sơ organization.")
        allowed = {"representative_name", "hotline", "contact_email", "fanpage_url"}
        invalid = set(request.data) - allowed
        if invalid:
            raise ValidationError(
                {key: "Trường này không được cập nhật bởi đại diện CLB." for key in invalid}
            )
        serializer = OrganizationSerializer(organization, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = UserProfile.objects.select_related("role", "organization").filter(
            user=request.user
        ).first()
        if not profile:
            return Response({"id": request.user.id, "username": request.user.username})
        return Response(_user_data(request.user, profile))

    def patch(self, request):
        user = request.user
        allowed = {"first_name", "last_name", "email", "phone"}
        for key in set(request.data) - allowed:
            raise ValidationError({key: "Trường này không được cập nhật ở đây."})
        for key in {"first_name", "last_name", "email"}.intersection(request.data):
            setattr(user, key, request.data[key])
        profile = UserProfile.objects.select_related("role", "organization").filter(user=user).first()
        if profile and "phone" in request.data:
            phone = str(request.data["phone"]).strip()
            if phone and (not re.fullmatch(r"\+?[0-9][0-9 .-]*", phone) or not 9 <= len(re.sub(r"\D", "", phone)) <= 15):
                raise ValidationError({"phone": "Số điện thoại/Zalo không hợp lệ."})
            profile.phone = phone
        if profile and is_clb_rep(user):
            values = (user.first_name.strip(), user.last_name.strip(), user.email.strip(), profile.phone.strip())
            profile.profile_completed_at = timezone.now() if all(values) else None
        user.save()
        if profile:
            profile.save(update_fields=["phone", "profile_completed_at"])
        return Response(_user_data(user, profile))


class AdminUserListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole, HasPermission("organization.manage")]

    def get(self, request):
        queryset = User.objects.select_related("booking_profile__role", "booking_profile__organization")
        if request.query_params.get("archived") == "1":
            queryset = queryset.filter(booking_profile__archived_at__isnull=False)
        else:
            queryset = queryset.filter(booking_profile__archived_at__isnull=True)
        organization_id = request.query_params.get("organization_id")
        if not is_admin(request.user) or not user_has_permission(request.user, "organization.manage"):
            queryset = queryset.filter(booking_profile__organization_id=get_user_organization_id(request.user))
        elif organization_id:
            queryset = queryset.filter(booking_profile__organization_id=organization_id)
        return Response(UserAdminSerializer(queryset, many=True).data)

    def post(self, request):
        payload = request.data.copy()
        generated_password = None
        if not payload.get("password"):
            generated_password = f"UET@{get_random_string(10)}"
            payload["password"] = generated_password
            payload["must_change_password"] = True
        serializer = UserAdminSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        role_name = serializer.validated_data.get("role", "CLB_REP")
        if not getattr(request.user, "is_superuser", False) and role_name != "CLB_REP":
            raise PermissionDenied("Chỉ Super Admin được tạo tài khoản quản trị.")
        organization = serializer.validated_data.get("organization")
        if not organization:
            serializer.validated_data["organization"] = _user_organization(request.user)
        if role_name == "CLB_REP" and not serializer.validated_data.get("organization"):
            raise ValidationError({"organization": "Cần chọn CLB cho tài khoản đại diện."})
        user = serializer.save()
        AuditLog.objects.create(
            user=request.user,
            action="create_user",
            entity_type="User",
            entity_id=str(user.pk),
            new_value=_user_audit_snapshot(user),
        )
        data = UserAdminSerializer(user).data
        if generated_password:
            data["password"] = generated_password
        return Response(data, status=status.HTTP_201_CREATED)


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole, HasPermission("organization.manage")]

    def patch(self, request, pk):
        user = self._get_user(request, pk)
        if getattr(user, "booking_profile", None) and user.booking_profile.archived_at:
            raise ValidationError("Hãy khôi phục tài khoản trước khi chỉnh sửa.")
        old_value = _user_audit_snapshot(user)
        serializer = UserAdminSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        role_name = serializer.validated_data.get("role")
        if (
            role_name
            and not getattr(request.user, "is_superuser", False)
            and role_name != "CLB_REP"
        ):
            raise PermissionDenied("Chỉ Super Admin được cấp role quản trị.")
        serializer.save()
        AuditLog.objects.create(
            user=request.user,
            action="update_user",
            entity_type="User",
            entity_id=str(user.pk),
            old_value=old_value,
            new_value=_user_audit_snapshot(user),
        )
        return Response(UserAdminSerializer(user).data)

    def post(self, request, pk):
        if request.resolver_match.url_name == "admin-user-restore":
            with transaction.atomic():
                user = self._get_user(request, pk)
                organization_id = UserProfile.objects.filter(user=user).values_list(
                    "organization_id", flat=True
                ).first()
                organization = (
                    Organization.objects.select_for_update().filter(pk=organization_id).first()
                    if organization_id else None
                )
                profile = UserProfile.objects.select_for_update().select_related(
                    "user", "role"
                ).filter(user=user).first()
                if not profile or profile.role.name != "CLB_REP" or user.is_superuser or user.is_staff:
                    raise PermissionDenied("Chỉ khôi phục tài khoản đại diện CLB ở đây.")
                if not profile.archived_at:
                    return Response(UserAdminSerializer(profile.user).data)
                if not organization or not organization.active or organization.archived_at:
                    raise ValidationError("Hãy khôi phục CLB trước khi khôi phục tài khoản.")
                restored_user = _restore_club_profile(profile, request.user)
                return Response(UserAdminSerializer(restored_user).data)
        if not request.resolver_match.url_name.endswith("reset-password") and (
            request.resolver_match.url_name != "admin-user-reset-password-alias"
        ):
            return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)
        user = self._get_user(request, pk)
        if getattr(user, "booking_profile", None) and user.booking_profile.archived_at:
            raise ValidationError("Hãy khôi phục tài khoản trước khi đặt lại mật khẩu.")
        password = request.data.get("password") or f"UET@{get_random_string(8)}"
        validate_password(password, user)
        user.set_password(password)
        user.save(update_fields=["password"])
        profile = UserProfile.objects.filter(user=user).first()
        if profile:
            profile.must_change_password = True
            profile.save(update_fields=["must_change_password"])
        AuditLog.objects.create(
            user=request.user,
            action="reset_user_password",
            entity_type="User",
            entity_id=str(user.pk),
            new_value={"must_change_password": True},
        )
        return Response({"detail": "Đã đặt lại mật khẩu.", "password": password})

    def delete(self, request, pk):
        with transaction.atomic():
            user = self._get_user(request, pk)
            profile = UserProfile.objects.select_for_update().select_related(
                "user", "role"
            ).filter(user=user).first()
            if not profile or profile.role.name != "CLB_REP" or user.is_superuser or user.is_staff:
                raise PermissionDenied("Chỉ được xóa tài khoản đại diện CLB.")
            if not profile.archived_at:
                _archive_club_profile(profile, request.user, timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _get_user(self, request, pk):
        user = User.objects.select_related("booking_profile").filter(pk=pk).first()
        if not user:
            from rest_framework.exceptions import NotFound
            raise NotFound()
        if not is_admin(request.user) and get_user_organization_id(user) != get_user_organization_id(request.user):
            raise PermissionDenied()
        return user


class OrganizationViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated, IsAdminRole, HasPermission("organization.manage")]

    def get_queryset(self):
        queryset = Organization.objects.all()
        if self.action == "list":
            archived = self.request.query_params.get("archived") == "1"
            queryset = queryset.filter(archived_at__isnull=not archived)
        return queryset

    def perform_create(self, serializer):
        organization = serializer.save()
        AuditLog.objects.create(
            user=self.request.user,
            action="create_organization",
            entity_type="Organization",
            entity_id=str(organization.pk),
            new_value=OrganizationSerializer(organization).data,
        )

    def perform_update(self, serializer):
        organization = self.get_object()
        if organization.archived_at:
            raise ValidationError("Hãy khôi phục CLB trước khi chỉnh sửa.")
        old_value = OrganizationSerializer(organization).data
        organization = serializer.save()
        AuditLog.objects.create(
            user=self.request.user,
            action="update_organization",
            entity_type="Organization",
            entity_id=str(organization.pk),
            old_value=old_value,
            new_value=OrganizationSerializer(organization).data,
        )

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            organization = Organization.objects.select_for_update().get(pk=self.get_object().pk)
            if not organization.archived_at:
                old_value = OrganizationSerializer(organization).data
                archived_at = timezone.now()
                organization.active = False
                organization.archived_at = archived_at
                organization.save(update_fields=["active", "archived_at"])
                profiles = UserProfile.objects.select_for_update().select_related("user", "role").filter(
                    organization=organization,
                    role__name="CLB_REP",
                    archived_at__isnull=True,
                )
                for profile in profiles:
                    _archive_club_profile(profile, request.user, archived_at)
                AuditLog.objects.create(
                    user=request.user,
                    action="archive_organization",
                    entity_type="Organization",
                    entity_id=str(organization.pk),
                    old_value=old_value,
                    new_value=OrganizationSerializer(organization).data,
                )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        with transaction.atomic():
            organization = Organization.objects.select_for_update().get(pk=self.get_object().pk)
            if organization.archived_at:
                old_value = OrganizationSerializer(organization).data
                organization.active = True
                organization.archived_at = None
                organization.save(update_fields=["active", "archived_at"])
                AuditLog.objects.create(
                    user=request.user,
                    action="restore_organization",
                    entity_type="Organization",
                    entity_id=str(organization.pk),
                    old_value=old_value,
                    new_value=OrganizationSerializer(organization).data,
                )
        return Response(OrganizationSerializer(organization).data)


class FacilityArchiveMixin:
    parent_archive_filters = ()

    def filter_archive_queryset(self, queryset):
        if self.action == "list" and self.request.query_params.get("archived") == "1":
            return queryset.filter(archived_at__isnull=False) if is_admin(self.request.user) else queryset.none()
        if self.action == "list" or not is_admin(self.request.user):
            queryset = queryset.filter(archived_at__isnull=True)
            for field in self.parent_archive_filters:
                queryset = queryset.filter(**{field: True})
        return queryset

    def perform_update(self, serializer):
        if serializer.instance.archived_at:
            raise ValidationError("Hãy khôi phục địa điểm trước khi chỉnh sửa.")
        serializer.save()

    def _related_rooms(self, instance):
        if isinstance(instance, Campus):
            return Room.objects.filter(building__campus=instance)
        if isinstance(instance, Building):
            return Room.objects.filter(building=instance)
        return Room.objects.filter(pk=instance.pk)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            instance = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if not instance.archived_at:
                room_ids = list(self._related_rooms(instance).select_for_update().values_list("pk", flat=True))
                if Booking.objects.filter(
                    Q(room_id__in=room_ids) | Q(secondary_room_id__in=room_ids),
                    end_time__gt=timezone.now(),
                    status__in=[
                        BookingStatus.DRAFT,
                        BookingStatus.PENDING_HOLD,
                        BookingStatus.NEEDS_REVISION,
                        BookingStatus.APPROVED,
                        BookingStatus.ROOM_CHANGED,
                    ],
                ).exists():
                    raise ValidationError("Địa điểm còn đơn mượn sắp tới. Hãy xử lý các đơn trước khi xóa.")
                old_value = self.get_serializer(instance).data
                instance.was_active_before_archive = instance.active
                instance.active = False
                instance.archived_at = timezone.now()
                instance.save(update_fields=["was_active_before_archive", "active", "archived_at"])
                AuditLog.objects.create(
                    user=request.user, action=f"archive_{instance._meta.model_name}",
                    entity_type=type(instance).__name__, entity_id=str(instance.pk),
                    old_value=old_value, new_value=self.get_serializer(instance).data,
                )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        with transaction.atomic():
            instance = self.get_queryset().select_for_update().get(pk=self.get_object().pk)
            if isinstance(instance, Building) and instance.campus.archived_at:
                raise ValidationError("Hãy khôi phục cơ sở trước khi khôi phục tòa nhà.")
            if isinstance(instance, Room) and (
                instance.building.archived_at or instance.building.campus.archived_at
            ):
                raise ValidationError("Hãy khôi phục cơ sở và tòa nhà trước khi khôi phục phòng.")
            if instance.archived_at:
                old_value = self.get_serializer(instance).data
                instance.active = instance.was_active_before_archive
                instance.archived_at = None
                instance.save(update_fields=["active", "archived_at"])
                AuditLog.objects.create(
                    user=request.user, action=f"restore_{instance._meta.model_name}",
                    entity_type=type(instance).__name__, entity_id=str(instance.pk),
                    old_value=old_value, new_value=self.get_serializer(instance).data,
                )
        return Response(self.get_serializer(instance).data)


class CampusViewSet(FacilityArchiveMixin, viewsets.ModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "campus.manage"

    def get_queryset(self):
        return self.filter_archive_queryset(Campus.objects.all())


class BuildingViewSet(FacilityArchiveMixin, viewsets.ModelViewSet):
    serializer_class = BuildingSerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "building.manage"
    parent_archive_filters = ("campus__archived_at__isnull",)

    def get_queryset(self):
        queryset = Building.objects.select_related("campus").all()
        campus_id = self.request.query_params.get("campus_id")
        if campus_id:
            queryset = queryset.filter(campus_id=campus_id)
        return self.filter_archive_queryset(queryset)


class RoomViewSet(FacilityArchiveMixin, viewsets.ModelViewSet):
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "room.manage"
    parent_archive_filters = ("building__archived_at__isnull", "building__campus__archived_at__isnull")

    def get_queryset(self):
        queryset = Room.objects.select_related("building", "building__campus").all()

        campus_id = self.request.query_params.get("campus_id")
        building_id = self.request.query_params.get("building_id")
        active = self.request.query_params.get("active")
        rentable = self.request.query_params.get("rentable")

        if campus_id:
            queryset = queryset.filter(building__campus_id=campus_id)
        if building_id:
            queryset = queryset.filter(building_id=building_id)
        if active is not None:
            queryset = queryset.filter(active=_parse_bool(active))
        if rentable is not None:
            queryset = queryset.filter(rentable=_parse_bool(rentable))

        return self.filter_archive_queryset(queryset)

    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        start_time = _parse_required_datetime(
            request.query_params.get("start_time"),
            "start_time",
        )
        end_time = _parse_required_datetime(
            request.query_params.get("end_time"),
            "end_time",
        )
        if start_time >= end_time:
            raise ValidationError(
                {"end_time": "Thời gian kết thúc phải sau thời gian bắt đầu."}
            )

        queryset = self.get_queryset().filter(active=True, rentable=True)
        campus_id = request.query_params.get("campus_id")
        building_id = request.query_params.get("building_id")
        if campus_id:
            queryset = queryset.filter(building__campus_id=campus_id)
        if building_id:
            queryset = queryset.filter(building_id=building_id)

        participant_count = request.query_params.get("participant_count")
        if participant_count is not None:
            try:
                participant_count = int(participant_count)
            except ValueError as exc:
                raise ValidationError({"participant_count": "Số người không hợp lệ."}) from exc
            if participant_count < 1:
                raise ValidationError({"participant_count": "Số người phải lớn hơn 0."})
            queryset = queryset.filter(
                Q(capacity__isnull=True) | Q(capacity__gte=participant_count)
            )

        exclude_booking_id = request.query_params.get("exclude_booking")
        exclude_booking = None
        if exclude_booking_id:
            exclude_booking = (
                filter_bookings_for_user(Booking.objects.all(), request.user)
                .filter(pk=exclude_booking_id)
                .first()
            )
            if exclude_booking is None:
                raise ValidationError(
                    {"exclude_booking": "Booking loại trừ không hợp lệ."}
                )

        try:
            rooms = booking_service.get_available_rooms(
                start_time,
                end_time,
                current_booking_id=exclude_booking.pk if exclude_booking else None,
                queryset=queryset,
                actor=request.user,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_serialize_django_validation_error(exc)) from exc

        serializer = self.get_serializer(rooms, many=True)
        return Response(serializer.data)


class BookingViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated, BookingObjectPermission]

    def get_permissions(self):
        action_permissions = {
            "create": [IsAuthenticated(), HasPermission("booking.create")],
            "create_batch": [IsAuthenticated(), HasPermission("booking.create")],
            "create_draft": [IsAuthenticated(), HasPermission("booking.create")],
            "submit": [IsAuthenticated(), HasPermission("booking.create")],
            "update_and_submit": [IsAuthenticated(), HasPermission("booking.create")],
            "approve": [IsAuthenticated(), HasPermission("booking.approve")],
            "reject": [IsAuthenticated(), HasPermission("booking.reject")],
            "request_revision": [
                IsAuthenticated(),
                HasPermission("booking.request_revision"),
            ],
            "change_room": [IsAuthenticated(), HasPermission("booking.change_room")],
            "confirm_scan": [IsAuthenticated(), HasPermission("booking.approve")],
            "confirm_physical": [IsAuthenticated(), HasPermission("booking.approve")],
            "deadlines": [IsAuthenticated(), HasPermission("rule_config.manage")],
            "export_mau_b": [IsAuthenticated(), HasPermission("document_template.manage")],
        }
        return action_permissions.get(self.action, super().get_permissions())

    def get_queryset(self):
        if self.action in {"list", "retrieve"}:
            booking_service.release_expired_drafts()
        queryset = (
            Booking.objects.select_related(
                "organization",
                "room",
                "room__building",
                "room__building__campus",
                "secondary_room",
                "created_by",
            )
            .defer("scan_data")
        )
        queryset = filter_bookings_for_user(queryset, self.request.user)
        if self.action == "list" and is_admin(self.request.user):
            queryset = queryset.exclude(status=BookingStatus.DRAFT)
        return _apply_booking_filters(queryset, self.request.query_params)

    def perform_create(self, serializer):
        serializer.save()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                booking_service.release_expired_drafts()
                self.perform_create(serializer)
                booking = booking_service.submit_booking(serializer.instance, request.user)
        except DjangoValidationError as exc:
            raise ValidationError(_serialize_django_validation_error(exc)) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        except IntegrityError as exc:
            raise ValidationError("Phòng đã có lịch trùng trong khoảng thời gian này.") from exc
        return Response(self.get_serializer(booking).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="batch")
    def create_batch(self, request):
        """Create one multi-room request atomically, one collision-safe booking per room."""
        room_ids = request.data.get("room_ids")
        if not isinstance(room_ids, list) or not 2 <= len(room_ids) <= 20 or any(type(value) is not int or value < 1 for value in room_ids) or len(set(room_ids)) != len(room_ids):
            raise ValidationError({"room_ids": "Chọn từ 2 đến 20 phòng khác nhau."})
        payload = {key: value for key, value in request.data.items() if key != "room_ids"}
        group = uuid4()
        bookings = []
        try:
            with transaction.atomic():
                booking_service.release_expired_drafts()
                for room_id in room_ids:
                    serializer = self.get_serializer(data={**payload, "room": room_id, "secondary_room": None})
                    serializer.is_valid(raise_exception=True)
                    booking = serializer.save()
                    booking.application_group = group
                    booking.save(update_fields=["application_group", "updated_at"])
                    bookings.append(booking_service.submit_booking(booking, request.user))
        except DjangoValidationError as exc:
            raise ValidationError(_serialize_django_validation_error(exc)) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        except IntegrityError as exc:
            raise ValidationError("Một trong các phòng đã có lịch trùng. Không phòng nào được giữ.") from exc
        return Response(self.get_serializer(bookings, many=True).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="drafts")
    def create_draft(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                booking_service.release_expired_drafts()
                booking = Booking(created_by=request.user, **serializer.validated_data)
                booking_service.prepare_draft_hold(booking, actor=request.user)
                booking.full_clean()
                booking.save()
        except DjangoValidationError as exc:
            raise ValidationError(_serialize_django_validation_error(exc)) from exc
        except IntegrityError as exc:
            raise ValidationError("Phòng đã có lịch trùng trong khoảng thời gian này.") from exc
        return Response(self.get_serializer(booking).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path="update-and-submit")
    def update_and_submit(self, request, pk=None):
        booking = self.get_object()
        if booking.status not in {BookingStatus.DRAFT, BookingStatus.NEEDS_REVISION}:
            raise ValidationError("Chỉ có thể gửi bản nháp hoặc đơn cần chỉnh sửa.")
        serializer = self.get_serializer(booking, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                self.perform_update(serializer)
                booking = booking_service.submit_booking(serializer.instance, request.user)
        except DjangoValidationError as exc:
            raise ValidationError(_serialize_django_validation_error(exc)) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc
        except IntegrityError as exc:
            raise ValidationError("Phòng đã có lịch trùng trong khoảng thời gian này.") from exc
        return Response(self.get_serializer(booking).data)

    def perform_update(self, serializer):
        booking = self.get_object()
        if not is_admin(self.request.user) and booking.status not in {
            BookingStatus.DRAFT,
            BookingStatus.PENDING_HOLD,
            BookingStatus.NEEDS_REVISION,
        }:
            raise PermissionDenied(
                "CLB chỉ được sửa đơn khi đơn chưa được duyệt và chưa xác nhận bản cứng."
            )
        if (
            not is_admin(self.request.user)
            and booking.physical_status == PhysicalStatus.DA_NHAN_BAN_CUNG
        ):
            raise PermissionDenied(
                "Đơn đã được VP Đoàn xác nhận nhận bản cứng, CLB không thể chỉnh sửa."
            )
        old_value = {
            "room_id": booking.room_id,
            "secondary_room_id": booking.secondary_room_id,
            "start_time": booking.start_time.isoformat() if booking.start_time else None,
            "end_time": booking.end_time.isoformat() if booking.end_time else None,
            "activity_name": booking.activity_name,
            "participant_count": booking.participant_count,
        }
        try:
            with transaction.atomic():
                booking_service.release_expired_drafts()
                previous = copy(booking) if booking.status == BookingStatus.DRAFT else None
                instance = serializer.save()
                if instance.status == BookingStatus.DRAFT:
                    booking_service.prepare_draft_hold(instance, previous, actor=self.request.user)
                instance.full_clean()
                if instance.status in CONFLICT_STATUSES:
                    booking_service.validate_active_booking_schedule(instance, self.request.user)
                instance.save()
                AuditLog.objects.create(
                    user=self.request.user,
                    action="update",
                    entity_type="Booking",
                    entity_id=str(instance.pk),
                    old_value=old_value,
                    new_value={
                        "room_id": instance.room_id,
                        "secondary_room_id": instance.secondary_room_id,
                        "start_time": instance.start_time.isoformat() if instance.start_time else None,
                        "end_time": instance.end_time.isoformat() if instance.end_time else None,
                        "activity_name": instance.activity_name,
                        "participant_count": instance.participant_count,
                    },
                )
        except DjangoValidationError as exc:
            raise ValidationError(_serialize_django_validation_error(exc)) from exc
        except IntegrityError as exc:
            raise ValidationError("Phòng đã có lịch trùng trong khoảng thời gian này.") from exc

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        booking = self.get_object()
        serializer = BookingActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._service_response(
            booking_service.submit_booking,
            booking,
            request.user,
            serializer.validated_data.get("reason"),
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        booking = self.get_object()
        serializer = BookingActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._service_response(
            booking_service.approve_booking,
            booking,
            request.user,
            serializer.validated_data.get("reason"),
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        booking = self.get_object()
        serializer = BookingActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._service_response(
            booking_service.reject_booking,
            booking,
            request.user,
            serializer.validated_data.get("reason"),
        )

    @action(detail=True, methods=["post"], url_path="request-revision")
    def request_revision(self, request, pk=None):
        booking = self.get_object()
        serializer = BookingActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._service_response(
            booking_service.request_revision,
            booking,
            request.user,
            serializer.validated_data.get("reason"),
        )

    @action(detail=True, methods=["post"], url_path="change-room")
    def change_room(self, request, pk=None):
        booking = self.get_object()
        serializer = ChangeRoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._service_response(
            booking_service.change_room,
            booking,
            serializer.validated_data["new_room"],
            request.user,
            serializer.validated_data.get("reason"),
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        serializer = BookingActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._service_response(
            booking_service.cancel_booking,
            booking,
            request.user,
            serializer.validated_data.get("reason"),
        )

    @action(detail=True, methods=["get", "post"], url_path="scan")
    def scan(self, request, pk=None):
        booking = self.get_object()
        if request.method == "GET":
            if not booking.scan_data:
                raise ValidationError("Đơn chưa có bản scan.")
            response = HttpResponse(bytes(booking.scan_data), content_type=booking.scan_content_type)
            response["Content-Disposition"] = f'inline; filename="{booking.scan_file_name}"'
            response["X-Content-Type-Options"] = "nosniff"
            return response
        if not is_admin(request.user) and booking.organization_id != get_user_organization_id(request.user):
            raise PermissionDenied("Chỉ đại diện đơn vị của đơn được nộp bản scan.")
        if booking.status not in {BookingStatus.PENDING_HOLD, BookingStatus.NEEDS_REVISION}:
            raise ValidationError("Chỉ đơn đang chờ xử lý mới được tải bản scan.")
        if booking.scan_deadline_at and timezone.now() > booking.scan_deadline_at and not is_admin(request.user):
            raise ValidationError("Đã quá hạn nộp bản scan. Vui lòng liên hệ cán bộ để được gia hạn.")
        uploaded = request.FILES.get("file")
        if not uploaded or uploaded.size > 5 * 1024 * 1024:
            raise ValidationError("Chọn tệp PDF/JPG/PNG không quá 5 MB.")
        content = uploaded.read()
        mime = "application/pdf" if content.startswith(b"%PDF-") else "image/png" if content.startswith(b"\x89PNG\r\n\x1a\n") else "image/jpeg" if content.startswith(b"\xff\xd8\xff") else None
        if not mime:
            raise ValidationError("Chỉ chấp nhận tệp PDF, JPG hoặc PNG hợp lệ.")
        booking.scan_data = content
        booking.scan_content_type = mime
        booking.scan_file_name = re.sub(r"[^\w.\-]", "_", uploaded.name)[-100:]
        booking.scan_uploaded_at = timezone.now()
        booking.scan_confirmed_at = None
        booking.scan_confirmed_by = None
        booking.save(update_fields=["scan_data", "scan_content_type", "scan_file_name", "scan_uploaded_at", "scan_confirmed_at", "scan_confirmed_by", "updated_at"])
        if booking.application_group:
            Booking.objects.filter(application_group=booking.application_group, status__in=[BookingStatus.PENDING_HOLD, BookingStatus.NEEDS_REVISION]).exclude(pk=booking.pk).update(
                scan_data=content, scan_content_type=mime, scan_file_name=booking.scan_file_name,
                scan_uploaded_at=booking.scan_uploaded_at, scan_confirmed_at=None, scan_confirmed_by=None,
            )
        AuditLog.objects.create(user=request.user, action="upload_scan", entity_type="Booking", entity_id=str(booking.pk), new_value={"file_name": booking.scan_file_name})
        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"], url_path="confirm-scan")
    def confirm_scan(self, request, pk=None):
        booking = self.get_object()
        if not booking.scan_uploaded_at:
            raise ValidationError("CLB chưa tải bản scan.")
        booking.scan_confirmed_at = timezone.now()
        booking.scan_confirmed_by = request.user
        booking.save(update_fields=["scan_confirmed_at", "scan_confirmed_by", "updated_at"])
        if booking.application_group:
            Booking.objects.filter(application_group=booking.application_group, scan_uploaded_at__isnull=False).update(scan_confirmed_at=booking.scan_confirmed_at, scan_confirmed_by=request.user)
        AuditLog.objects.create(user=request.user, action="confirm_scan", entity_type="Booking", entity_id=str(booking.pk))
        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"], url_path="confirm-physical")
    def confirm_physical(self, request, pk=None):
        booking = self.get_object()
        if booking.status not in {BookingStatus.PENDING_HOLD, BookingStatus.NEEDS_REVISION}:
            raise ValidationError("Đơn không còn chờ xử lý.")
        booking.physical_status = PhysicalStatus.DA_NHAN_BAN_CUNG
        booking.physical_confirmed_at = timezone.now()
        booking.physical_confirmed_by = request.user
        booking.save(update_fields=["physical_status", "physical_confirmed_at", "physical_confirmed_by", "updated_at"])
        if booking.application_group:
            Booking.objects.filter(application_group=booking.application_group, status__in=[BookingStatus.PENDING_HOLD, BookingStatus.NEEDS_REVISION]).update(
                physical_status=booking.physical_status, physical_confirmed_at=booking.physical_confirmed_at, physical_confirmed_by=request.user,
            )
        AuditLog.objects.create(user=request.user, action="confirm_physical", entity_type="Booking", entity_id=str(booking.pk))
        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["patch"], url_path="deadlines")
    def deadlines(self, request, pk=None):
        booking = self.get_object()
        allowed = {"scan_deadline_at", "paper_deadline_at"}
        if set(request.data) - allowed or not request.data:
            raise ValidationError("Chỉ được chỉnh hạn bản scan hoặc bản cứng.")
        fields = []
        for field in allowed.intersection(request.data):
            parsed = parse_datetime(request.data[field])
            if not parsed or timezone.is_naive(parsed):
                raise ValidationError({field: "Thời điểm phải có múi giờ hợp lệ."})
            setattr(booking, field, parsed)
            fields.append(field)
        if "scan_deadline_at" in fields:
            booking.hold_expires_at = booking.scan_deadline_at
            fields.append("hold_expires_at")
        if booking.status == BookingStatus.EXPIRED:
            if "scan_deadline_at" not in fields or booking.scan_deadline_at <= timezone.now():
                raise ValidationError("Muốn mở lại đơn hết hạn cần đặt hạn scan mới trong tương lai.")
            try:
                booking_service.validate_active_booking_schedule(booking, request.user)
            except DjangoValidationError as exc:
                raise ValidationError(_serialize_django_validation_error(exc)) from exc
            booking.status = BookingStatus.PENDING_HOLD
            fields.append("status")
        try:
            booking.save(update_fields=fields + ["updated_at"])
        except IntegrityError as exc:
            raise ValidationError("Phòng đã được giữ bởi đơn khác, không thể mở lại đơn này.") from exc
        AuditLog.objects.create(user=request.user, action="extend_deadline", entity_type="Booking", entity_id=str(booking.pk), new_value={field: getattr(booking, field).isoformat() for field in allowed if field in request.data})
        return Response(self.get_serializer(booking).data)

    @action(detail=False, methods=["post"], url_path="export-mau-a")
    def export_mau_a(self, request):
        from backend.bookings.document_renderer import render_mau_a
        fields = request.data.get("fields")
        if not isinstance(fields, dict) or not isinstance(fields.get("slots"), list) or not fields["slots"]:
            raise ValidationError("Cần chọn ít nhất một đơn để xuất Mẫu A.")
        if fields.get("headerType", "hsv") not in {"hsv", "doan"}:
            raise ValidationError({"headerType": "Chọn Hội Sinh viên hoặc Đoàn Thanh niên."})
        ids = [slot.get("bookingId") for slot in fields["slots"] if isinstance(slot, dict)]
        owned = Booking.objects.filter(pk__in=ids)
        if not is_admin(request.user):
            owned = owned.filter(organization_id=get_user_organization_id(request.user))
        if owned.count() != len(set(ids)):
            raise PermissionDenied("Bạn không có quyền xuất một hoặc nhiều đơn đã chọn.")
        content = render_mau_a(fields)
        response = HttpResponse(content, content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        response["Content-Disposition"] = 'attachment; filename="mau-a.docx"'
        return response

    @action(detail=False, methods=["post"], url_path="export-mau-b")
    def export_mau_b(self, request):
        from backend.bookings.document_renderer import render_mau_b
        rows = request.data.get("rows")
        template = request.data.get("template")
        if not isinstance(rows, list) or not rows or len(rows) > 100 or not isinstance(template, dict):
            raise ValidationError("Danh sách đơn hoặc nội dung Mẫu B không hợp lệ.")
        if any(not isinstance(row, dict) for row in rows):
            raise ValidationError("Dòng trong Mẫu B không hợp lệ.")
        content = render_mau_b(rows, template, str(request.data.get("issueDate", "")))
        response = HttpResponse(content, content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        response["Content-Disposition"] = 'attachment; filename="mau-b.docx"'
        return response

    @action(detail=False, methods=["get"], url_path="calendar")
    def calendar(self, request):
        booking_service.release_expired_drafts()
        queryset = (
            Booking.objects.select_related(
                "organization",
                "room",
                "room__building",
                "room__building__campus",
                "secondary_room",
                "created_by",
            )
            .filter(Q(status__in=CONFLICT_STATUSES) | Q(status=BookingStatus.DRAFT, hold_expires_at__gt=timezone.now()))
            .order_by("start_time")
        )
        queryset = _apply_booking_filters(queryset, request.query_params)
        user_org_id = get_user_organization_id(request.user)
        admin = is_admin(request.user)
        data = []
        for booking in queryset:
            own = user_org_id is not None and booking.organization_id == user_org_id
            if (admin or own) and booking.status != BookingStatus.DRAFT:
                data.append(self.get_serializer(booking).data)
                continue
            data.append(
                {
                    "id": f"busy-{booking.room_id}-{booking.start_time.isoformat()}",
                    "organization": None,
                    "organization_name": "",
                    "organization_profile": None,
                    "room": booking.room_id,
                    "room_name": booking.room.name,
                    "secondary_room": None,
                    "activity_name": "Không khả dụng",
                    "description": "",
                    "participant_count": 0,
                    "contact_person": "",
                    "contact_phone": "",
                    "contact_email": "",
                    "start_time": booking.start_time,
                    "end_time": booking.end_time,
                    "setup_time_minutes": 0,
                    "teardown_time_minutes": 0,
                    "equipment_request": {},
                    "notes": "",
                    "status": BookingStatus.PENDING_HOLD,
                    "physical_status": PhysicalStatus.CHUA_NHAN,
                    "physical_confirmed_at": None,
                    "physical_confirmed_by": None,
                    "hold_expires_at": None,
                    "campus_id": booking.room.building.campus_id,
                    "building_id": booking.room.building_id,
                    "created_by_id": None,
                    "created_at": None,
                    "updated_at": None,
                    "hidden_details": True,
                }
            )
        return Response(data)

    def _service_response(self, service_func, *args):
        try:
            booking = service_func(*args)
        except DjangoValidationError as exc:
            raise ValidationError(_serialize_django_validation_error(exc)) from exc
        except DjangoPermissionDenied as exc:
            raise PermissionDenied(str(exc)) from exc

        serializer = self.get_serializer(booking)
        return Response(serializer.data, status=status.HTTP_200_OK)


class RoomBlackoutViewSet(viewsets.ModelViewSet):
    serializer_class = RoomBlackoutSerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "blackout.manage"

    def get_queryset(self):
        return RoomBlackout.objects.select_related("building", "created_by").all()

    def perform_create(self, serializer):
        blackout = serializer.save(created_by=self.request.user)
        AuditLog.objects.create(
            user=self.request.user,
            action="create",
            entity_type="RoomBlackout",
            entity_id=str(blackout.pk),
            new_value=RoomBlackoutSerializer(blackout).data,
        )

    def perform_destroy(self, instance):
        old_value = RoomBlackoutSerializer(instance).data
        pk = instance.pk
        instance.delete()
        AuditLog.objects.create(
            user=self.request.user,
            action="delete",
            entity_type="RoomBlackout",
            entity_id=str(pk),
            old_value=old_value,
        )


class BorrowingPolicyViewSet(viewsets.ModelViewSet):
    queryset = BorrowingPolicy.objects.select_related("campus", "building", "room").all()
    serializer_class = BorrowingPolicySerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "rule_config.manage"

    def perform_create(self, serializer):
        values = serializer.validated_data
        if BorrowingPolicy.objects.filter(campus=values["campus"], building=values.get("building"), room=values.get("room")).exists():
            raise ValidationError("Đã có quy tắc cho phạm vi này. Hãy sửa quy tắc hiện tại.")
        policy = serializer.save(updated_by=self.request.user)
        AuditLog.objects.create(user=self.request.user, action="create_borrowing_policy", entity_type="BorrowingPolicy", entity_id=str(policy.pk))

    def perform_update(self, serializer):
        policy = serializer.save(updated_by=self.request.user)
        AuditLog.objects.create(user=self.request.user, action="update_borrowing_policy", entity_type="BorrowingPolicy", entity_id=str(policy.pk))


class BusinessRuleConfigViewSet(viewsets.ModelViewSet):
    queryset = BusinessRuleConfig.objects.all()
    serializer_class = BusinessRuleConfigSerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "rule_config.manage"
    lookup_field = "key"

    def perform_create(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        AuditLog.objects.create(
            user=self.request.user,
            action="create",
            entity_type="BusinessRuleConfig",
            entity_id=instance.key,
            new_value=BusinessRuleConfigSerializer(instance).data,
        )

    def perform_update(self, serializer):
        old_value = BusinessRuleConfigSerializer(self.get_object()).data
        instance = serializer.save(updated_by=self.request.user)
        AuditLog.objects.create(
            user=self.request.user,
            action="update",
            entity_type="BusinessRuleConfig",
            entity_id=instance.key,
            old_value=old_value,
            new_value=BusinessRuleConfigSerializer(instance).data,
        )


class DocumentTemplateViewSet(viewsets.ModelViewSet):
    queryset = DocumentTemplate.objects.all()
    serializer_class = DocumentTemplateSerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "document_template.manage"
    lookup_field = "template_type"

    def perform_create(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        AuditLog.objects.create(
            user=self.request.user,
            action="create",
            entity_type="DocumentTemplate",
            entity_id=instance.template_type,
            new_value=DocumentTemplateSerializer(instance).data,
        )

    def perform_update(self, serializer):
        old_value = DocumentTemplateSerializer(self.get_object()).data
        instance = serializer.save(updated_by=self.request.user)
        AuditLog.objects.create(
            user=self.request.user,
            action="update",
            entity_type="DocumentTemplate",
            entity_id=instance.template_type,
            old_value=old_value,
            new_value=DocumentTemplateSerializer(instance).data,
        )


class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Notification.objects.filter(user=self.request.user)
        unread = self.request.query_params.get("unread")
        if unread is not None:
            queryset = queryset.filter(is_read=not _parse_bool(unread))
        return queryset.select_related("related_booking")

    def partial_update(self, request, *args, **kwargs):
        invalid = set(request.data) - {"is_read"}
        if invalid:
            raise ValidationError(
                {key: "Truong nay khong duoc cap nhat." for key in invalid}
            )
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"updated": updated})


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, HasPermission("audit_log.view")]

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("user").all()
        entity_type = self.request.query_params.get("entity_type")
        action = self.request.query_params.get("action")
        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)
        if action:
            queryset = queryset.filter(action=action)
        return queryset


def _apply_booking_filters(queryset, params):
    status_value = params.get("status")
    physical_status = params.get("physical_status")
    campus = params.get("campus")
    campus_id = params.get("campus_id") or campus
    organization_id = params.get("org_id") or params.get("organization_id")
    room = params.get("room")
    room_id = params.get("room_id") or room
    date_value = params.get("date")

    if status_value:
        queryset = queryset.filter(status=status_value)
    if physical_status:
        queryset = queryset.filter(physical_status=physical_status)
    if campus_id:
        queryset = queryset.filter(room__building__campus_id=campus_id)
    if organization_id:
        queryset = queryset.filter(organization_id=organization_id)
    if room_id:
        queryset = queryset.filter(room_id=room_id)
    if date_value:
        parsed_date = parse_date(date_value)
        if parsed_date is None:
            raise ValidationError({"date": "Ngày lọc không hợp lệ."})
        queryset = queryset.filter(start_time__date=parsed_date)

    return queryset


def _parse_required_datetime(value, field_name):
    if not value:
        raise ValidationError({field_name: "Trường này là bắt buộc."})

    parsed_value = parse_datetime(value)
    if parsed_value is None:
        raise ValidationError({field_name: "Datetime không hợp lệ."})

    if timezone.is_naive(parsed_value):
        parsed_value = timezone.make_aware(parsed_value, timezone.get_current_timezone())

    return parsed_value


def _parse_bool(value):
    return str(value).lower() in {"1", "true", "yes", "y"}


def _serialize_django_validation_error(exc):
    if hasattr(exc, "message_dict"):
        return exc.message_dict
    if hasattr(exc, "messages"):
        return exc.messages
    return str(exc)


def _user_organization(user):
    organization_id = get_user_organization_id(user)
    return Organization.objects.filter(pk=organization_id, active=True).first()


def _user_data(user, profile):
    return {
        "id": user.pk,
        "username": user.get_username(),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "role": profile.role.name if profile else None,
        "organization": OrganizationSerializer(profile.organization).data
        if profile and profile.organization
        else None,
        "must_change_password": profile.must_change_password if profile else False,
        "profile_completed": bool(profile and profile.profile_completed_at),
        "phone": profile.phone if profile else "",
    }


def _user_audit_snapshot(user):
    profile = getattr(user, "booking_profile", None)
    return {
        "username": user.get_username(),
        "email": user.email,
        "is_active": user.is_active,
        "role": profile.role.name if profile else None,
        "organization_id": profile.organization_id if profile else None,
        "must_change_password": profile.must_change_password if profile else False,
        "archived_at": profile.archived_at.isoformat() if profile and profile.archived_at else None,
    }


def _archive_club_profile(profile, actor, archived_at):
    user = profile.user
    old_value = _user_audit_snapshot(user)
    profile.was_active_before_archive = user.is_active
    profile.archived_at = archived_at
    profile.save(update_fields=["was_active_before_archive", "archived_at"])
    user.is_active = False
    user.save(update_fields=["is_active"])
    AuditLog.objects.create(
        user=actor,
        action="archive_user",
        entity_type="User",
        entity_id=str(user.pk),
        old_value=old_value,
        new_value=_user_audit_snapshot(user),
    )


def _restore_club_profile(profile, actor):
    user = profile.user
    old_value = _user_audit_snapshot(user)
    profile.archived_at = None
    profile.save(update_fields=["archived_at"])
    user.is_active = profile.was_active_before_archive
    user.save(update_fields=["is_active"])
    AuditLog.objects.create(
        user=actor,
        action="restore_user",
        entity_type="User",
        entity_id=str(user.pk),
        old_value=old_value,
        new_value=_user_audit_snapshot(user),
    )
    return user


__all__ = [
    "AuditLogViewSet",
    "BookingViewSet",
    "BuildingViewSet",
    "BusinessRuleConfigViewSet",
    "CampusViewSet",
    "DocumentTemplateViewSet",
    "NotificationViewSet",
    "RoomBlackoutViewSet",
    "RoomViewSet",
    "TokenObtainPairView",
    "AccountTokenObtainPairView",
    "TokenRefreshView",
]
