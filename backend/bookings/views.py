import mimetypes
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse, Http404
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import mixins, status, viewsets
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
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
    UploadScanSerializer,
    ChangePasswordSerializer,
    OrganizationSerializer,
    UserAdminSerializer,
    AuditLogSerializer,
    BusinessRuleConfigSerializer,
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
        allowed = {"first_name", "last_name", "email"}
        for key in set(request.data) - allowed:
            raise ValidationError({key: "Trường này không được cập nhật ở đây."})
        for key in allowed.intersection(request.data):
            setattr(user, key, request.data[key])
        user.save()
        return Response(_user_data(user, UserProfile.objects.select_related("role", "organization").filter(user=user).first()))


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


class CampusViewSet(viewsets.ModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "campus.manage"


class BuildingViewSet(viewsets.ModelViewSet):
    serializer_class = BuildingSerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "building.manage"

    def get_queryset(self):
        queryset = Building.objects.select_related("campus").all()
        campus_id = self.request.query_params.get("campus_id")
        if campus_id:
            queryset = queryset.filter(campus_id=campus_id)
        return queryset


class RoomViewSet(viewsets.ModelViewSet):
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated, AdminWriteOrReadOnly]
    write_permission_key = "room.manage"

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

        return queryset

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

        rooms = booking_service.get_available_rooms(
            start_time,
            end_time,
            current_booking_id=exclude_booking.pk if exclude_booking else None,
            queryset=queryset,
        )

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
            "submit": [IsAuthenticated(), HasPermission("booking.create")],
            "confirm_physical": [
                IsAuthenticated(),
                HasPermission("booking.confirm_physical_submission"),
            ],
            "approve": [IsAuthenticated(), HasPermission("booking.approve")],
            "reject": [IsAuthenticated(), HasPermission("booking.reject")],
            "request_revision": [
                IsAuthenticated(),
                HasPermission("booking.request_revision"),
            ],
            "change_room": [IsAuthenticated(), HasPermission("booking.change_room")],
        }
        return action_permissions.get(self.action, super().get_permissions())

    def get_queryset(self):
        queryset = (
            Booking.objects.select_related(
                "organization",
                "room",
                "room__building",
                "room__building__campus",
                "secondary_room",
                "created_by",
            )
            .all()
        )
        queryset = filter_bookings_for_user(queryset, self.request.user)
        return _apply_booking_filters(queryset, self.request.query_params)

    def perform_create(self, serializer):
        serializer.save()

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
            and booking.physical_status == PhysicalStatus.CONFIRMED_RECEIVED
        ):
            raise PermissionDenied(
                "Đơn đã được VP Đoàn xác nhận nhận bản cứng, CLB không thể chỉnh sửa."
            )
        old_value = {
            "room_id": booking.room_id,
            "secondary_room_id": booking.secondary_room_id,
            "start_time": booking.start_time.isoformat(),
            "end_time": booking.end_time.isoformat(),
            "activity_name": booking.activity_name,
            "participant_count": booking.participant_count,
        }
        try:
            with transaction.atomic():
                instance = serializer.save()
                instance.full_clean()
                if instance.status in CONFLICT_STATUSES:
                    booking_service.validate_active_booking_schedule(instance)
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
                        "start_time": instance.start_time.isoformat(),
                        "end_time": instance.end_time.isoformat(),
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

    @action(
        detail=True,
        methods=["post"],
        parser_classes=[MultiPartParser, FormParser],
        url_path="upload-scan",
    )
    def upload_scan(self, request, pk=None):
        booking = self.get_object()
        serializer = UploadScanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        return self._service_response(
            booking_service.upload_scan,
            booking,
            serializer.validated_data["file"],
            request.user,
        )

    @action(detail=True, methods=["get"], url_path="scan")
    def scan(self, request, pk=None):
        booking = self.get_object()
        media_prefix = settings.MEDIA_URL.rstrip("/") + "/"
        path = unquote(urlparse(booking.scan_file_url).path)
        if not path.startswith(media_prefix):
            raise Http404()
        storage_path = path[len(media_prefix):]
        parts = PurePosixPath(storage_path).parts
        if not parts or any(part in {".", ".."} for part in parts):
            raise Http404()
        try:
            stored_file = default_storage.open(storage_path, "rb")
        except (FileNotFoundError, OSError):
            raise Http404() from None
        content_type = mimetypes.guess_type(storage_path)[0] or "application/octet-stream"
        return FileResponse(stored_file, content_type=content_type)

    @action(detail=True, methods=["post"], url_path="confirm-physical")
    def confirm_physical(self, request, pk=None):
        booking = self.get_object()
        return self._service_response(
            booking_service.confirm_physical,
            booking,
            request.user,
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

    @action(detail=False, methods=["get"], url_path="calendar")
    def calendar(self, request):
        queryset = (
            Booking.objects.select_related(
                "organization",
                "room",
                "room__building",
                "room__building__campus",
                "secondary_room",
                "created_by",
            )
            .filter(status__in=CONFLICT_STATUSES)
            .order_by("start_time")
        )
        queryset = _apply_booking_filters(queryset, request.query_params)
        user_org_id = get_user_organization_id(request.user)
        admin = is_admin(request.user)
        data = []
        for booking in queryset:
            own = user_org_id is not None and booking.organization_id == user_org_id
            if admin or own:
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
                    "physical_status": PhysicalStatus.NOT_SUBMITTED,
                    "scan_file_url": "",
                    "physical_submitted_at": None,
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
