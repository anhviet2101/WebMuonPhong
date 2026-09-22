from datetime import timedelta

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
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
    Booking,
    BookingStatus,
    Building,
    Campus,
    Room,
    RoomBlackout,
)
from backend.bookings.permissions import (
    AdminWriteOrReadOnly,
    BookingObjectPermission,
    HasPermission,
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
)
from backend.bookings.auth import AccountTokenObtainPairSerializer
from backend.bookings.models import Organization, UserProfile
from backend.bookings.services import booking_service


CONFLICT_STATUSES = [
    BookingStatus.PENDING_HOLD.value,
    BookingStatus.APPROVED.value,
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
        for key in allowed.intersection(request.data):
            setattr(organization, key, request.data[key])
        organization.full_clean()
        organization.save(update_fields=list(allowed.intersection(request.data)))
        return Response(OrganizationSerializer(organization).data)


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
    permission_classes = [IsAuthenticated, HasPermission("organization.manage")]

    def get(self, request):
        queryset = User.objects.select_related("booking_profile__role", "booking_profile__organization")
        organization_id = request.query_params.get("organization_id")
        if not is_admin(request.user) or not user_has_permission(request.user, "organization.manage"):
            queryset = queryset.filter(booking_profile__organization_id=get_user_organization_id(request.user))
        elif organization_id:
            queryset = queryset.filter(booking_profile__organization_id=organization_id)
        return Response(UserAdminSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = UserAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role_name = serializer.validated_data.get("role", "CLB_REP")
        if not getattr(request.user, "is_superuser", False) and role_name != "CLB_REP":
            raise PermissionDenied("Chỉ Super Admin được tạo tài khoản quản trị.")
        organization = serializer.validated_data.get("organization")
        if not organization:
            serializer.validated_data["organization"] = _user_organization(request.user)
        user = serializer.save()
        return Response(UserAdminSerializer(user).data, status=status.HTTP_201_CREATED)


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("organization.manage")]

    def patch(self, request, pk):
        user = self._get_user(request, pk)
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
        return Response(UserAdminSerializer(user).data)

    def post(self, request, pk):
        if not request.resolver_match.url_name.endswith("reset-password") and (
            request.resolver_match.url_name != "admin-user-reset-password-alias"
        ):
            return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)
        user = self._get_user(request, pk)
        password = request.data.get("password") or f"UET@{get_random_string(8)}"
        validate_password(password, user)
        user.set_password(password)
        user.save(update_fields=["password"])
        profile = UserProfile.objects.filter(user=user).first()
        if profile:
            profile.must_change_password = True
            profile.save(update_fields=["must_change_password"])
        return Response({"detail": "Đã đặt lại mật khẩu.", "password": password})

    def _get_user(self, request, pk):
        user = User.objects.select_related("booking_profile").filter(pk=pk).first()
        if not user:
            from rest_framework.exceptions import NotFound
            raise NotFound()
        if not is_admin(request.user) and get_user_organization_id(user) != get_user_organization_id(request.user):
            raise PermissionDenied()
        return user


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

        rooms = [
            room
            for room in queryset
            if _room_is_available(room, start_time, end_time)
        ]

        serializer = self.get_serializer(rooms, many=True)
        return Response(serializer.data)


class BookingViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
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
    permission_classes = [IsAuthenticated, HasPermission("blackout.manage")]

    def get_queryset(self):
        return RoomBlackout.objects.select_related("building", "created_by").all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


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


def _room_is_available(room, start_time, end_time):
    buffered_start, buffered_end = _buffered_requested_range(room, start_time, end_time)

    has_booking_conflict = Booking.objects.filter(
        room=room,
        status__in=CONFLICT_STATUSES,
        during__overlap=(buffered_start, buffered_end),
    ).exists()
    if has_booking_conflict:
        return False

    has_blackout_conflict = (
        RoomBlackout.objects.filter(
            start_time__lt=buffered_end,
            end_time__gt=buffered_start,
        )
        .filter(
            Q(scope_type="room", room_ids__contains=[room.pk])
            | Q(scope_type="building", building=room.building)
            | Q(scope_type="floor", building=room.building, floor=room.floor)
        )
        .exists()
    )

    return not has_blackout_conflict


def _buffered_requested_range(room, start_time, end_time):
    return (
        start_time - timedelta(minutes=room.buffer_before_minutes),
        end_time + timedelta(minutes=room.buffer_after_minutes),
    )


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


__all__ = [
    "BookingViewSet",
    "BuildingViewSet",
    "CampusViewSet",
    "RoomBlackoutViewSet",
    "RoomViewSet",
    "TokenObtainPairView",
    "AccountTokenObtainPairView",
    "TokenRefreshView",
]
