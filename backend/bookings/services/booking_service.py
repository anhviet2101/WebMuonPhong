from datetime import timedelta
from pathlib import Path

from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.storage import default_storage
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import get_valid_filename

from backend.bookings.models import (
    ApprovalDecision,
    AuditLog,
    Booking,
    BookingApproval,
    BookingStatus,
    BusinessRuleConfig,
    Notification,
    PhysicalStatus,
    Room,
    RoomBlackout,
    BlackoutScopeType,
)
from backend.bookings.permissions import is_admin as rbac_is_admin
from backend.bookings.permissions import get_user_organization_id, user_has_permission


PHYSICAL_SUBMISSION_DEADLINE_KEY = "physical_submission_deadline_hours"
DEFAULT_PHYSICAL_SUBMISSION_DEADLINE_HOURS = 48
MIN_ADVANCE_HOURS_KEY = "min_advance_hours"
MAX_ADVANCE_DAYS_KEY = "max_advance_days"
MAX_BOOKING_DURATION_HOURS_KEY = "max_booking_duration_hours"
MAX_BOOKINGS_PER_WEEK_PER_ORG_KEY = "max_bookings_per_week_per_org"
LARGE_HALL_MIN_ADVANCE_DAYS_KEY = "large_hall_min_advance_days"
LARGE_ACTIVITY_PARTICIPANT_THRESHOLD_KEY = "large_activity_participant_threshold"
MAX_SCAN_FILE_SIZE_BYTES = 10 * 1024 * 1024
ALLOWED_SCAN_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
DRAFT = BookingStatus.DRAFT.value
PENDING_HOLD = BookingStatus.PENDING_HOLD.value
NEEDS_REVISION = BookingStatus.NEEDS_REVISION.value
REJECTED = BookingStatus.REJECTED.value
APPROVED = BookingStatus.APPROVED.value
ROOM_CHANGED = BookingStatus.ROOM_CHANGED.value
COMPLETED = BookingStatus.COMPLETED.value
CANCELLED = BookingStatus.CANCELLED.value
EXPIRED = BookingStatus.EXPIRED.value

NOT_SUBMITTED = PhysicalStatus.NOT_SUBMITTED.value
SUBMITTED = PhysicalStatus.SUBMITTED.value
CONFIRMED_RECEIVED = PhysicalStatus.CONFIRMED_RECEIVED.value

BLACKOUT_ROOM = BlackoutScopeType.ROOM.value
BLACKOUT_BUILDING = BlackoutScopeType.BUILDING.value
BLACKOUT_FLOOR = BlackoutScopeType.FLOOR.value

CONFLICT_STATUSES = [PENDING_HOLD, APPROVED, ROOM_CHANGED]


def get_available_rooms(start_time, end_time, current_booking_id=None, queryset=None):
    """Return rooms free of active holds, bookings and blackouts, including buffers."""
    if not start_time or not end_time or start_time >= end_time:
        raise ValidationError("Thời gian kết thúc phải sau thời gian bắt đầu.")

    rooms = queryset if queryset is not None else Room.objects.select_related(
        "building", "building__campus"
    )
    rooms = rooms.filter(
        active=True,
        rentable=True,
        building__active=True,
        building__campus__active=True,
    )
    available = []
    for room in rooms:
        buffered_start = start_time - timedelta(minutes=room.buffer_before_minutes)
        buffered_end = end_time + timedelta(minutes=room.buffer_after_minutes)
        conflicts = Booking.objects.filter(
            room=room,
            status__in=CONFLICT_STATUSES,
            during__overlap=(buffered_start, buffered_end),
        )
        if current_booking_id is not None:
            conflicts = conflicts.exclude(pk=current_booking_id)
        if conflicts.exists():
            continue

        blackouts = RoomBlackout.objects.filter(
            start_time__lt=buffered_end,
            end_time__gt=buffered_start,
        ).filter(
            Q(scope_type=BLACKOUT_ROOM, room_ids__contains=[room.pk])
            | Q(scope_type=BLACKOUT_BUILDING, building_id=room.building_id)
            | Q(
                scope_type=BLACKOUT_FLOOR,
                building_id=room.building_id,
                floor=room.floor,
            )
        )
        if not blackouts.exists():
            available.append(room)
    return available


def validate_active_booking_schedule(booking):
    """Recheck all server-side availability rules after an active booking edit."""
    _ensure_room_can_be_booked(booking, booking.room)
    _validate_no_room_conflict(booking, booking.room)
    _validate_no_blackout_conflict(booking, booking.room)

ADMIN_GROUP_NAMES = {
    "YU_ADMIN",
    "SUPER_ADMIN",
    "VP_DOAN",
    "VAN_PHONG_DOAN",
}

ADMIN_PERMISSION_CANDIDATES = {
    "booking.approve",
    "booking.reject",
    "booking.request_revision",
    "booking.change_room",
    "booking.confirm_physical_submission",
    "booking.cancel_any",
    "booking.manage",
}

ALLOWED_TRANSITIONS = {
    DRAFT: {PENDING_HOLD, CANCELLED},
    NEEDS_REVISION: {
        PENDING_HOLD,
        APPROVED,
        CANCELLED,
    },
    PENDING_HOLD: {
        APPROVED,
        NEEDS_REVISION,
        REJECTED,
        CANCELLED,
        EXPIRED,
    },
    APPROVED: {
        ROOM_CHANGED,
        COMPLETED,
        CANCELLED,
    },
    ROOM_CHANGED: {
        COMPLETED,
        CANCELLED,
    },
}

ADMIN_ONLY_TARGETS = {
    APPROVED,
    NEEDS_REVISION,
    REJECTED,
    ROOM_CHANGED,
}

AUDIT_ACTION_BY_TARGET = {
    PENDING_HOLD: "submit",
    APPROVED: "approve",
    NEEDS_REVISION: "request_revision",
    REJECTED: "reject",
    ROOM_CHANGED: "change_room",
    CANCELLED: "cancel",
    EXPIRED: "expire",
    COMPLETED: "complete",
}


def transition_status(booking, target_status, user, reason=None, new_room=None):
    """Move a booking through the B.5 state machine inside one DB transaction."""

    target_status = _normalize_status(target_status)

    try:
        with transaction.atomic():
            locked_booking = _lock_booking(booking)
            old_value = _booking_audit_snapshot(locked_booking)

            _validate_transition(
                booking=locked_booking,
                target_status=target_status,
                user=user,
                reason=reason,
                new_room=new_room,
            )

            update_fields = ["status", "updated_at"]
            metadata = {}

            if target_status == PENDING_HOLD:
                _prepare_pending_hold(locked_booking)
                update_fields.append("hold_expires_at")

            if target_status == ROOM_CHANGED:
                resolved_room = _resolve_room_for_update(new_room)
                if resolved_room.pk == locked_booking.room_id:
                    raise ValidationError("Phòng mới phải khác phòng hiện tại.")
                _ensure_room_can_be_booked(locked_booking, resolved_room)
                _validate_no_room_conflict(locked_booking, resolved_room)
                _validate_no_blackout_conflict(locked_booking, resolved_room)

                locked_booking.room = resolved_room
                update_fields.append("room")
                metadata["new_room_id"] = resolved_room.pk

            locked_booking.status = target_status
            locked_booking.save(update_fields=update_fields)

            if target_status in {
                APPROVED,
                NEEDS_REVISION,
                REJECTED,
            }:
                _create_booking_approval(locked_booking, user, target_status, reason)

            _create_audit_log(
                booking=locked_booking,
                user=user,
                action=AUDIT_ACTION_BY_TARGET.get(target_status, "transition_status"),
                old_value=old_value,
                reason=reason,
                metadata=metadata,
            )
            _create_transition_notifications(locked_booking, target_status, reason)

            return locked_booking
    except IntegrityError as exc:
        _raise_validation_error_for_conflict(exc)
        raise


def submit_booking(booking, user, reason=None):
    return transition_status(
        booking=booking,
        target_status=PENDING_HOLD,
        user=user,
        reason=reason,
    )


def approve_booking(booking, user, reason=None):
    return transition_status(
        booking=booking,
        target_status=APPROVED,
        user=user,
        reason=reason,
    )


def reject_booking(booking, user, reason=None):
    return transition_status(
        booking=booking,
        target_status=REJECTED,
        user=user,
        reason=reason,
    )


def request_revision(booking, user, reason=None):
    return transition_status(
        booking=booking,
        target_status=NEEDS_REVISION,
        user=user,
        reason=reason,
    )


def change_room(booking, new_room, user, reason=None):
    if booking.status in {PENDING_HOLD, NEEDS_REVISION, ROOM_CHANGED}:
        _require_yu_admin(user)
        try:
            with transaction.atomic():
                locked_booking = _lock_booking(booking)
                if locked_booking.status not in {PENDING_HOLD, NEEDS_REVISION, ROOM_CHANGED}:
                    raise ValidationError("Trạng thái đơn đã thay đổi. Vui lòng tải lại.")
                resolved_room = _resolve_room_for_update(new_room)
                if resolved_room.pk == locked_booking.room_id:
                    raise ValidationError("Phòng mới phải khác phòng hiện tại.")
                _ensure_room_can_be_booked(locked_booking, resolved_room)
                _validate_no_room_conflict(locked_booking, resolved_room)
                _validate_no_blackout_conflict(locked_booking, resolved_room)
                old_value = _booking_audit_snapshot(locked_booking)
                locked_booking.room = resolved_room
                locked_booking.save(update_fields=["room", "updated_at"])
                _create_audit_log(
                    booking=locked_booking,
                    user=user,
                    action="change_room",
                    old_value=old_value,
                    reason=reason,
                    metadata={"new_room_id": resolved_room.pk},
                )
                _create_transition_notifications(locked_booking, ROOM_CHANGED, reason)
                return locked_booking
        except IntegrityError as exc:
            _raise_validation_error_for_conflict(exc)
            raise
    return transition_status(
        booking=booking,
        target_status=ROOM_CHANGED,
        user=user,
        reason=reason,
        new_room=new_room,
    )


def cancel_booking(booking, user, reason=None):
    return transition_status(
        booking=booking,
        target_status=CANCELLED,
        user=user,
        reason=reason,
    )


def upload_scan(booking, file, user=None):
    """Persist a signed application scan and mark the physical copy as submitted."""

    _validate_scan_file(file)
    saved_path = None

    try:
        with transaction.atomic():
            locked_booking = _lock_booking(booking)
            _validate_can_upload_scan(locked_booking)

            old_value = _booking_audit_snapshot(locked_booking)
            saved_path = default_storage.save(
                _build_scan_storage_path(locked_booking, file),
                file,
            )

            locked_booking.scan_file_url = default_storage.url(saved_path)
            locked_booking.physical_status = SUBMITTED
            locked_booking.physical_submitted_at = timezone.now()
            locked_booking.save(
                update_fields=[
                    "scan_file_url",
                    "physical_status",
                    "physical_submitted_at",
                    "updated_at",
                ]
            )

            _create_audit_log(
                booking=locked_booking,
                user=user or locked_booking.created_by,
                action="upload_scan",
                old_value=old_value,
            )
            _notify_admins(
                Notification.NotificationType.SUBMITTED,
                f"CLB đã upload bản scan cho đơn '{locked_booking.activity_name}'.",
                locked_booking,
            )

            return locked_booking
    except Exception:
        if saved_path:
            default_storage.delete(saved_path)
        raise


def confirm_physical(booking, admin_user):
    """Confirm that the Youth Union office received the hard-copy application."""

    _require_yu_admin(admin_user)

    with transaction.atomic():
        locked_booking = _lock_booking(booking)

        old_value = _booking_audit_snapshot(locked_booking)
        locked_booking.physical_status = CONFIRMED_RECEIVED
        locked_booking.physical_confirmed_at = timezone.now()
        locked_booking.physical_confirmed_by = admin_user
        locked_booking.save(
            update_fields=[
                "physical_status",
                "physical_confirmed_at",
                "physical_confirmed_by",
                "updated_at",
            ]
        )

        _create_audit_log(
            booking=locked_booking,
            user=admin_user,
            action="confirm_physical",
            old_value=old_value,
        )
        _notify_user(
            locked_booking.created_by,
            Notification.NotificationType.SUBMITTED,
            f"VP Đoàn đã xác nhận nhận bản cứng cho đơn '{locked_booking.activity_name}'.",
            locked_booking,
        )

        return locked_booking


def _validate_transition(booking, target_status, user, reason, new_room):
    if booking.status == target_status:
        raise ValidationError("Trạng thái đích trùng với trạng thái hiện tại.")

    if target_status == CANCELLED:
        _validate_cancel_transition(booking, user, reason)
        return

    allowed_targets = ALLOWED_TRANSITIONS.get(booking.status, set())
    if target_status not in allowed_targets:
        raise ValidationError(
            f"Không thể chuyển booking từ {booking.status} sang {target_status}."
        )

    if target_status in ADMIN_ONLY_TARGETS:
        _require_yu_admin(user)

    if target_status == PENDING_HOLD:
        _ensure_room_can_be_booked(booking, booking.room)
        _validate_business_rules(booking)
        _validate_no_room_conflict(booking, booking.room)
        _validate_no_blackout_conflict(booking, booking.room)

    if target_status == APPROVED:
        if booking.physical_status != CONFIRMED_RECEIVED:
            raise ValidationError("Chưa nhận bản cứng từ CLB")
        _ensure_room_can_be_booked(booking, booking.room)
        _validate_no_blackout_conflict(booking, booking.room)

    if target_status == ROOM_CHANGED and new_room is None:
        raise ValidationError("Cần truyền new_room khi đổi phòng.")

    if target_status == EXPIRED:
        _validate_expire_transition(booking)

    if target_status == COMPLETED:
        _validate_complete_transition(booking)


def _validate_cancel_transition(booking, user, reason):
    if booking.status == CANCELLED:
        raise ValidationError("Booking đã bị hủy.")

    if _is_yu_admin(user):
        if not reason:
            raise ValidationError("VP Đoàn phải nhập lý do khi hủy booking.")
        return

    if booking.status in {APPROVED, ROOM_CHANGED}:
        raise PermissionDenied("CLB chỉ được hủy booking trước khi được duyệt.")

    if booking.status not in {
        DRAFT,
        PENDING_HOLD,
        NEEDS_REVISION,
    }:
        raise ValidationError(f"Không thể hủy booking ở trạng thái {booking.status}.")

    if not _is_own_booking(user, booking):
        raise PermissionDenied("Bạn không có quyền hủy booking này.")


def _validate_expire_transition(booking):
    if booking.hold_expires_at and booking.hold_expires_at > timezone.now():
        raise ValidationError("Booking chưa hết hạn giữ chỗ.")

    if booking.physical_status != NOT_SUBMITTED:
        raise ValidationError("Booking đã nộp bản cứng nên không thể tự hết hạn.")


def _validate_complete_transition(booking):
    if booking.end_time > timezone.now():
        raise ValidationError("Booking chưa qua thời gian kết thúc.")


def _prepare_pending_hold(booking):
    booking.hold_expires_at = timezone.now() + timedelta(
        hours=_get_business_rule_int(
            PHYSICAL_SUBMISSION_DEADLINE_KEY,
            DEFAULT_PHYSICAL_SUBMISSION_DEADLINE_HOURS,
        )
    )


def _get_business_rule_int(key, default):
    config = BusinessRuleConfig.objects.filter(key=key).first()
    if not config:
        return default

    value = config.value
    if isinstance(value, dict):
        value = value.get("value", default)

    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _validate_business_rules(booking):
    now = timezone.now()

    min_advance_hours = _get_business_rule_int(MIN_ADVANCE_HOURS_KEY, 0)
    if min_advance_hours > 0 and booking.start_time < now + timedelta(hours=min_advance_hours):
        raise ValidationError(
            f"Cần đăng ký trước tối thiểu {min_advance_hours} giờ."
        )

    max_advance_days = _get_business_rule_int(MAX_ADVANCE_DAYS_KEY, 0)
    if max_advance_days > 0 and booking.start_time > now + timedelta(days=max_advance_days):
        raise ValidationError(
            f"Không được đăng ký trước quá {max_advance_days} ngày."
        )

    max_duration_hours = _get_business_rule_int(MAX_BOOKING_DURATION_HOURS_KEY, 0)
    if max_duration_hours > 0:
        duration = booking.end_time - booking.start_time
        if duration > timedelta(hours=max_duration_hours):
            raise ValidationError(
                f"Thời lượng mượn phòng tối đa là {max_duration_hours} giờ."
            )

    max_weekly = _get_business_rule_int(MAX_BOOKINGS_PER_WEEK_PER_ORG_KEY, 0)
    if max_weekly > 0:
        week_start = booking.start_time - timedelta(days=booking.start_time.weekday())
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = week_start + timedelta(days=7)
        weekly_count = (
            Booking.objects.exclude(pk=booking.pk)
            .filter(
                organization_id=booking.organization_id,
                status__in=[PENDING_HOLD, APPROVED, ROOM_CHANGED],
                start_time__gte=week_start,
                start_time__lt=week_end,
            )
            .count()
        )
        if weekly_count >= max_weekly:
            raise ValidationError(
                f"CLB đã đạt tối đa {max_weekly} đơn trong tuần này."
            )

    large_threshold = _get_business_rule_int(LARGE_ACTIVITY_PARTICIPANT_THRESHOLD_KEY, 0)
    large_min_days = _get_business_rule_int(LARGE_HALL_MIN_ADVANCE_DAYS_KEY, 0)
    if (
        large_threshold > 0
        and large_min_days > 0
        and booking.participant_count >= large_threshold
        and booking.start_time < now + timedelta(days=large_min_days)
    ):
        raise ValidationError(
            f"Hoạt động lớn cần đăng ký trước tối thiểu {large_min_days} ngày."
        )


def _validate_no_room_conflict(booking, room):
    buffered_start, buffered_end = _buffered_range_for_room(booking, room)
    conflict_exists = (
        Booking.objects.exclude(pk=booking.pk)
        .filter(
            room=room,
            status__in=CONFLICT_STATUSES,
            during__overlap=(buffered_start, buffered_end),
        )
        .exists()
    )

    if conflict_exists:
        raise ValidationError("Phòng đã có lịch trùng trong khoảng thời gian này.")


def _validate_no_blackout_conflict(booking, room):
    buffered_start, buffered_end = _buffered_range_for_room(booking, room)
    conflict_exists = (
        RoomBlackout.objects.filter(
            start_time__lt=buffered_end,
            end_time__gt=buffered_start,
        )
        .filter(
            Q(scope_type=BLACKOUT_ROOM, room_ids__contains=[room.pk])
            | Q(scope_type=BLACKOUT_BUILDING, building=room.building)
            | Q(
                scope_type=BLACKOUT_FLOOR,
                building=room.building,
                floor=room.floor,
            )
        )
        .exists()
    )

    if conflict_exists:
        raise ValidationError("Phòng đang bị khóa trong khoảng thời gian này.")


def _ensure_room_can_be_booked(booking, room):
    if not room.active or not room.building.active or not room.building.campus.active:
        raise ValidationError("Phòng không còn hoạt động.")

    if not room.rentable:
        raise ValidationError("Phòng không cho phép CLB đăng ký.")

    if room.capacity is not None and booking.participant_count > room.capacity:
        raise ValidationError("Số lượng người tham dự vượt sức chứa phòng.")


def _buffered_range_for_room(booking, room):
    if not booking.start_time or not booking.end_time:
        raise ValidationError("Booking thiếu thời gian bắt đầu hoặc kết thúc.")

    if booking.start_time >= booking.end_time:
        raise ValidationError("Thời gian kết thúc phải sau thời gian bắt đầu.")

    return (
        booking.start_time - timedelta(minutes=room.buffer_before_minutes),
        booking.end_time + timedelta(minutes=room.buffer_after_minutes),
    )


def _validate_can_upload_scan(booking):
    if booking.status in {
        CANCELLED,
        EXPIRED,
        COMPLETED,
    }:
        raise ValidationError(
            "Không thể upload bản scan cho booking đã kết thúc hoặc không còn hiệu lực."
        )


def _validate_scan_file(file):
    if file is None:
        raise ValidationError("Vui lòng chọn file bản scan.")

    filename = getattr(file, "name", "")
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_SCAN_EXTENSIONS:
        raise ValidationError("File bản scan phải có định dạng .jpg, .jpeg, .png hoặc .pdf.")

    file_size = getattr(file, "size", None)
    if file_size is not None and file_size > MAX_SCAN_FILE_SIZE_BYTES:
        raise ValidationError("File bản scan không được vượt quá 10MB.")


def _build_scan_storage_path(booking, file):
    original_name = get_valid_filename(Path(file.name).name)
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
    return f"booking_scans/booking_{booking.pk}/{timestamp}_{original_name}"


def _create_booking_approval(booking, user, target_status, reason):
    decision_by_status = {
        APPROVED: ApprovalDecision.APPROVED.value,
        REJECTED: ApprovalDecision.REJECTED.value,
        NEEDS_REVISION: ApprovalDecision.NEEDS_REVISION.value,
    }

    BookingApproval.objects.create(
        booking=booking,
        approver=user,
        decision=decision_by_status[target_status],
        comment=reason or "",
    )


def _create_audit_log(booking, user, action, old_value, reason=None, metadata=None):
    new_value = _booking_audit_snapshot(booking)
    if reason:
        new_value["reason"] = reason

    if metadata:
        new_value.update(metadata)

    AuditLog.objects.create(
        user=user if _is_authenticated(user) else None,
        action=action,
        entity_type="Booking",
        entity_id=str(booking.pk),
        old_value=old_value,
        new_value=new_value,
    )


def _create_transition_notifications(booking, target_status, reason=None):
    message_by_status = {
        PENDING_HOLD: (
            Notification.NotificationType.SUBMITTED,
            f"Đơn '{booking.activity_name}' đã được gửi và đang giữ chỗ.",
        ),
        APPROVED: (
            Notification.NotificationType.APPROVED,
            f"Đơn '{booking.activity_name}' đã được duyệt.",
        ),
        NEEDS_REVISION: (
            Notification.NotificationType.NEEDS_REVISION,
            f"Đơn '{booking.activity_name}' cần bổ sung/chỉnh sửa.",
        ),
        REJECTED: (
            Notification.NotificationType.REJECTED,
            f"Đơn '{booking.activity_name}' đã bị từ chối.",
        ),
        ROOM_CHANGED: (
            Notification.NotificationType.ROOM_CHANGED,
            f"Đơn '{booking.activity_name}' đã được điều chỉnh phòng.",
        ),
        CANCELLED: (
            Notification.NotificationType.CANCELLED,
            f"Đơn '{booking.activity_name}' đã bị hủy.",
        ),
        EXPIRED: (
            Notification.NotificationType.EXPIRED,
            f"Đơn '{booking.activity_name}' đã hết hạn giữ chỗ.",
        ),
    }
    payload = message_by_status.get(target_status)
    if not payload:
        return

    notification_type, message = payload
    if reason:
        message = f"{message} Lý do/ghi chú: {reason}"

    if target_status == PENDING_HOLD:
        _notify_admins(notification_type, message, booking)

    _notify_user(booking.created_by, notification_type, message, booking)


def _notify_user(user, notification_type, message, booking):
    if not _is_authenticated(user):
        return
    Notification.objects.create(
        user=user,
        type=notification_type,
        message=message,
        related_booking=booking,
    )
    if getattr(user, "email", None):
        send_mail(
            subject="[Mượn phòng CLB] Cập nhật đơn",
            message=message,
            from_email=None,
            recipient_list=[user.email],
            fail_silently=True,
        )


def _notify_admins(notification_type, message, booking):
    admin_profiles = (
        booking.created_by.__class__.objects.filter(
            booking_profile__role__name__in=ADMIN_GROUP_NAMES,
            is_active=True,
        )
        .exclude(pk=booking.created_by_id)
        .distinct()
    )
    for admin_user in admin_profiles:
        _notify_user(admin_user, notification_type, message, booking)


def _booking_audit_snapshot(booking):
    return {
        "status": booking.status,
        "physical_status": booking.physical_status,
        "room_id": booking.room_id,
        "secondary_room_id": booking.secondary_room_id,
        "hold_expires_at": _isoformat_or_none(booking.hold_expires_at),
        "scan_file_url": booking.scan_file_url,
        "physical_submitted_at": _isoformat_or_none(booking.physical_submitted_at),
        "physical_confirmed_at": _isoformat_or_none(booking.physical_confirmed_at),
        "physical_confirmed_by_id": booking.physical_confirmed_by_id,
    }


def _isoformat_or_none(value):
    return value.isoformat() if value else None


def _lock_booking(booking):
    if not getattr(booking, "pk", None):
        raise ValidationError("Booking phải được lưu trước khi chuyển trạng thái.")

    return (
        Booking.objects.select_for_update()
        .select_related("room", "created_by")
        .get(pk=booking.pk)
    )


def _resolve_room_for_update(room):
    if isinstance(room, Room):
        room_id = room.pk
    else:
        room_id = room

    if not room_id:
        raise ValidationError("Phòng mới không hợp lệ.")

    return Room.objects.select_for_update().select_related("building").get(pk=room_id)


def _normalize_status(target_status):
    valid_statuses = {status.value for status in BookingStatus}
    normalized = getattr(target_status, "value", target_status)

    if normalized not in valid_statuses:
        raise ValidationError(f"Trạng thái không hợp lệ: {target_status}.")

    return normalized


def _require_yu_admin(user):
    if not _is_yu_admin(user):
        raise PermissionDenied("Bạn không có quyền thực hiện thao tác này.")


def _is_yu_admin(user):
    if not _is_authenticated(user):
        return False

    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True

    if rbac_is_admin(user):
        return True

    if any(user_has_permission(user, permission) for permission in ADMIN_PERMISSION_CANDIDATES):
        return True

    if any(_has_perm(user, permission) for permission in ADMIN_PERMISSION_CANDIDATES):
        return True

    groups = getattr(user, "groups", None)
    if groups is None:
        return False

    try:
        return groups.filter(name__in=ADMIN_GROUP_NAMES).exists()
    except Exception:
        return False


def _is_own_booking(user, booking):
    if not _is_authenticated(user):
        return False

    organization_id = get_user_organization_id(user)
    if organization_id is not None and booking.organization_id == organization_id:
        return True

    return False


def _has_perm(user, permission):
    try:
        return user.has_perm(permission)
    except Exception:
        return False


def _is_authenticated(user):
    return bool(user and getattr(user, "is_authenticated", False))


def _raise_validation_error_for_conflict(exc):
    if "prevent_room_double_booking" in str(exc):
        raise ValidationError("Phòng đã có lịch trùng trong khoảng thời gian này.") from exc


__all__ = [
    "approve_booking",
    "cancel_booking",
    "change_room",
    "confirm_physical",
    "get_available_rooms",
    "reject_booking",
    "request_revision",
    "submit_booking",
    "transition_status",
    "upload_scan",
    "validate_active_booking_schedule",
]
