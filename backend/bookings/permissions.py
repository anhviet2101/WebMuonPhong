from rest_framework.permissions import BasePermission, SAFE_METHODS

from backend.bookings.models import Booking, RolePermission


ADMIN_ROLE_NAMES = {"YU_ADMIN", "SUPER_ADMIN"}
CLB_REP_ROLE_NAME = "CLB_REP"


class HasPermission(BasePermission):
    message = "Bạn không có quyền thực hiện thao tác này."

    def __init__(self, permission_key=None):
        self.permission_key = permission_key

    def __call__(self):
        return self

    def has_permission(self, request, view):
        user = request.user
        if not _is_authenticated(user):
            return False

        if self.permission_key is None:
            return True

        return user_has_permission(user, self.permission_key)


class BookingObjectPermission(BasePermission):
    message = "Bạn không có quyền truy cập booking này."

    def has_object_permission(self, request, view, obj):
        if not _is_authenticated(request.user):
            return False

        if is_admin(request.user):
            return True

        if isinstance(obj, Booking):
            return is_own_organization(request.user, obj.organization_id)

        return True


class AdminWriteOrReadOnly(BasePermission):
    message = "Chỉ VP Đoàn hoặc Super Admin được thay đổi dữ liệu này."

    def has_permission(self, request, view):
        if not _is_authenticated(request.user):
            return False

        if request.method in SAFE_METHODS:
            return True

        permission_key = getattr(view, "write_permission_key", None)
        if permission_key:
            return user_has_permission(request.user, permission_key)

        return is_admin(request.user)


def filter_bookings_for_user(queryset, user):
    if is_admin(user):
        return queryset

    organization_id = get_user_organization_id(user)
    if organization_id is None:
        return queryset.none()

    return queryset.filter(organization_id=organization_id)


def user_has_permission(user, permission_key):
    if not _is_authenticated(user):
        return False

    if getattr(user, "is_superuser", False):
        return True

    role_ids = get_user_role_ids(user)
    if not role_ids:
        return False

    return RolePermission.objects.filter(
        role_id__in=role_ids,
        permission__key=permission_key,
    ).exists()


def is_admin(user):
    if not _is_authenticated(user):
        return False

    if getattr(user, "is_superuser", False):
        return True

    return bool(get_user_role_names(user) & ADMIN_ROLE_NAMES)


def is_clb_rep(user):
    return get_user_role_name(user) == CLB_REP_ROLE_NAME


def is_own_organization(user, organization_id):
    user_organization_id = get_user_organization_id(user)
    return user_organization_id is not None and user_organization_id == organization_id


def get_user_role_name(user):
    names = get_user_role_names(user)
    return next(iter(names), None)


def get_user_role_names(user):
    names = set()

    role = getattr(user, "role", None)
    if role:
        names.add(getattr(role, "name", role))

    profile = getattr(user, "booking_profile", None)
    if profile and profile.role_id:
        names.add(profile.role.name)

    return {str(name) for name in names if name}


def get_user_role_ids(user):
    role_ids = set()

    role_id = getattr(user, "role_id", None)
    if role_id:
        role_ids.add(role_id)

    profile = getattr(user, "booking_profile", None)
    if profile and profile.role_id:
        role_ids.add(profile.role_id)

    return role_ids


def get_user_organization_id(user):
    organization_id = getattr(user, "organization_id", None)
    if organization_id:
        return organization_id

    profile = getattr(user, "booking_profile", None)
    if profile:
        return profile.organization_id

    return None


def _is_authenticated(user):
    return bool(user and getattr(user, "is_authenticated", False))
