from datetime import datetime, time, timedelta
import logging
import re

from django.core.exceptions import PermissionDenied, ValidationError
from django.conf import settings
from django.core.mail import send_mass_mail
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from backend.bookings.models import (
    ApprovalDecision,
    AuditLog,
    Booking,
    BookingApproval,
    BookingStatus,
    BusinessRuleConfig,
    BorrowingPolicy,
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
SCAN_DEADLINE_HOURS_KEY = "scan_deadline_hours"
PAPER_CUTOFF_WEEKDAY_KEY = "paper_cutoff_weekday"
PAPER_CUTOFF_HOUR_KEY = "paper_cutoff_hour"
MIN_ADVANCE_HOURS_KEY = "min_advance_hours"
MAX_ADVANCE_DAYS_KEY = "max_advance_days"
MAX_BOOKING_DURATION_HOURS_KEY = "max_booking_duration_hours"
MAX_BOOKINGS_PER_WEEK_PER_ORG_KEY = "max_bookings_per_week_per_org"
LARGE_HALL_MIN_ADVANCE_DAYS_KEY = "large_hall_min_advance_days"
LARGE_ACTIVITY_PARTICIPANT_THRESHOLD_KEY = "large_activity_participant_threshold"
DRAFT = BookingStatus.DRAFT.value
PENDING_HOLD = BookingStatus.PENDING_HOLD.value
NEEDS_REVISION = BookingStatus.NEEDS_REVISION.value
REJECTED = BookingStatus.REJECTED.value
APPROVED = BookingStatus.APPROVED.value
ROOM_CHANGED = BookingStatus.ROOM_CHANGED.value
COMPLETED = BookingStatus.COMPLETED.value
CANCELLED = BookingStatus.CANCELLED.value
EXPIRED = BookingStatus.EXPIRED.value

NOT_SUBMITTED = PhysicalStatus.CHUA_NHAN.value
CONFIRMED_RECEIVED = PhysicalStatus.DA_NHAN_BAN_CUNG.value

BLACKOUT_ROOM = BlackoutScopeType.ROOM.value
BLACKOUT_BUILDING = BlackoutScopeType.BUILDING.value
BLACKOUT_FLOOR = BlackoutScopeType.FLOOR.value

CONFLICT_STATUSES = [PENDING_HOLD, APPROVED, ROOM_CHANGED]
DRAFT_HOLD_HOURS = 1
logger = logging.getLogger(__name__)


def release_expired_drafts():
    """Keep the draft, but release its room as soon as its one-hour hold ends."""
    now = timezone.now()
    return Booking.objects.filter(
        status=DRAFT, room__isnull=False, hold_expires_at__lte=now,
    ).update(room=None, secondary_room=None, during=None, hold_expires_at=None, updated_at=now)


def validate_booking_window(start_time, end_time):
    if not start_time or not end_time or start_time >= end_time:
        raise ValidationError("Vui lòng chọn thời gian bắt đầu và kết thúc hợp lệ.")
    start = timezone.localtime(start_time)
    end = timezone.localtime(end_time)
    if start.date() != end.date():
        raise ValidationError("Đơn mượn phòng phải bắt đầu và kết thúc trong cùng một ngày.")
    if start.weekday() == 6:
        raise ValidationError("Không nhận đăng ký mượn phòng vào Chủ nhật.")
    if end.hour * 60 + end.minute > 21 * 60 or (end.hour == 21 and (end.second or end.microsecond)):
        raise ValidationError("Thời gian mượn phòng phải kết thúc trước hoặc đúng 21:00.")


def paper_deadline_for(start_time):
    booking_day = timezone.localtime(start_time).date()
    week_monday = booking_day - timedelta(days=booking_day.weekday())
    cutoff_weekday = _get_business_rule_int(PAPER_CUTOFF_WEEKDAY_KEY, 3)
    cutoff_hour = _get_business_rule_int(PAPER_CUTOFF_HOUR_KEY, 15)
    if cutoff_weekday not in range(7) or cutoff_hour not in range(24):
        raise ValidationError("Cấu hình hạn nộp bản cứng không hợp lệ.")
    cutoff_day = week_monday - timedelta(days=7) + timedelta(days=cutoff_weekday)
    return timezone.make_aware(datetime.combine(cutoff_day, time(cutoff_hour)), timezone.get_current_timezone())


def validate_club_borrowing_policy(start_time, room, actor=None, policies=None):
    if actor is None or rbac_is_admin(actor):
        return
    requested = timezone.localtime(start_time).date()
    current = timezone.localdate()
    current_monday = current - timedelta(days=current.weekday())
    next_monday = current_monday + timedelta(days=7)
    if not next_monday <= requested < next_monday + timedelta(days=6):
        raise ValidationError("CLB chỉ được đăng ký từ thứ Hai đến thứ Bảy của tuần ngay sau tuần hiện tại.")
    if room is None:
        return
    week_key = next_monday.isoformat()
    matching = policies if policies is not None else BorrowingPolicy.objects.filter(campus_id=room.building.campus_id)
    for policy in matching:
        if policy.campus_id != room.building.campus_id or (policy.building_id and policy.building_id != room.building_id) or (policy.room_id and policy.room_id != room.pk):
            continue
        if week_key in policy.locked_weeks:
            raise ValidationError("Tuần này đã bị cán bộ khóa tại cơ sở/tòa nhà/phòng đã chọn.")
        if requested.weekday() not in policy.allowed_weekdays:
            raise ValidationError("Cơ sở/tòa nhà/phòng không cho mượn vào thứ đã chọn.")


def prepare_draft_hold(booking, previous=None, actor=None):
    if not booking.room_id:
        booking.hold_expires_at = None
        booking.secondary_room = None
        return
    release_expired_drafts()
    validate_booking_window(booking.start_time, booking.end_time)
    validate_club_borrowing_policy(booking.start_time, booking.room, actor)
    _ensure_room_can_be_booked(booking, booking.room)
    _validate_no_room_conflict(booking, booking.room)
    _validate_no_blackout_conflict(booking, booking.room)
    same_slot = previous and (
        previous.room_id == booking.room_id
        and previous.start_time == booking.start_time
        and previous.end_time == booking.end_time
        and previous.hold_expires_at
        and previous.hold_expires_at > timezone.now()
    )
    booking.hold_expires_at = previous.hold_expires_at if same_slot else timezone.now() + timedelta(hours=DRAFT_HOLD_HOURS)


def get_available_rooms(start_time, end_time, current_booking_id=None, queryset=None, actor=None):
    """Return rooms free of active holds, bookings and blackouts, including buffers."""
    if not start_time or not end_time or start_time >= end_time:
        raise ValidationError("Thời gian kết thúc phải sau thời gian bắt đầu.")
    release_expired_drafts()
    validate_booking_window(start_time, end_time)
    validate_club_borrowing_policy(start_time, None, actor)

    rooms = queryset if queryset is not None else Room.objects.select_related(
        "building", "building__campus"
    )
    rooms = rooms.filter(
        active=True,
        rentable=True,
        building__active=True,
        building__campus__active=True,
    )
    rooms = list(rooms)
    if not rooms:
        return []

    policies = list(BorrowingPolicy.objects.filter(campus_id__in={room.building.campus_id for room in rooms})) if actor is not None and not rbac_is_admin(actor) else []

    max_before = max(max(15, room.buffer_before_minutes) for room in rooms)
    max_after = max(max(15, room.buffer_after_minutes) for room in rooms)
    room_ids = [room.pk for room in rooms]
    conflicts = Booking.objects.filter(
        room_id__in=room_ids,
        start_time__lt=end_time + timedelta(minutes=max_before + max_after),
        end_time__gt=start_time - timedelta(minutes=max_before + max_after),
    ).filter(Q(status__in=CONFLICT_STATUSES) | Q(status=DRAFT, hold_expires_at__gt=timezone.now()))
    if current_booking_id is not None:
        conflicts = conflicts.exclude(pk=current_booking_id)
    bookings_by_room = {}
    for room_id, booked_start, booked_end in conflicts.values_list("room_id", "start_time", "end_time"):
        bookings_by_room.setdefault(room_id, []).append((booked_start, booked_end))

    blackouts = list(RoomBlackout.objects.filter(
        start_time__lt=end_time + timedelta(minutes=max_after),
        end_time__gt=start_time - timedelta(minutes=max_before),
    ).filter(
        Q(scope_type=BLACKOUT_ROOM, room_ids__overlap=room_ids)
        | Q(scope_type__in=[BLACKOUT_BUILDING, BLACKOUT_FLOOR], building_id__in=[room.building_id for room in rooms])
    ))

    available = []
    for room in rooms:
        try:
            validate_club_borrowing_policy(start_time, room, actor, policies)
        except ValidationError:
            continue
        before = max(15, room.buffer_before_minutes)
        after = max(15, room.buffer_after_minutes)
        buffered_start = start_time - timedelta(minutes=before)
        buffered_end = end_time + timedelta(minutes=after)
        if any(
            booked_start < buffered_end + timedelta(minutes=before)
            and booked_end > buffered_start - timedelta(minutes=after)
            for booked_start, booked_end in bookings_by_room.get(room.pk, [])
        ):
            continue
        if not any(
            blackout.start_time < buffered_end
            and blackout.end_time > buffered_start
            and (
                (blackout.scope_type == BLACKOUT_ROOM and room.pk in blackout.room_ids)
                or (blackout.scope_type == BLACKOUT_BUILDING and blackout.building_id == room.building_id)
                or (blackout.scope_type == BLACKOUT_FLOOR and blackout.building_id == room.building_id and blackout.floor == room.floor)
            )
            for blackout in blackouts
        ):
            available.append(room)
    return available


def validate_active_booking_schedule(booking, actor=None):
    """Recheck all server-side availability rules after an active booking edit."""
    validate_booking_window(booking.start_time, booking.end_time)
    validate_club_borrowing_policy(booking.start_time, booking.room, actor)
    release_expired_drafts()
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
            if target_status in {PENDING_HOLD, ROOM_CHANGED}:
                release_expired_drafts()
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
                update_fields.extend(["hold_expires_at", "scan_deadline_at", "paper_deadline_at"])

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
    _require_yu_admin(user)
    with transaction.atomic():
        locked_booking = _lock_booking(booking)
        if locked_booking.status not in {PENDING_HOLD, NEEDS_REVISION}:
            raise ValidationError("Chỉ duyệt đơn đang chờ xử lý.")
        if locked_booking.physical_status != CONFIRMED_RECEIVED:
            raise ValidationError("Cán bộ cần xác nhận đã nhận bản cứng trước khi duyệt.")
        return transition_status(locked_booking, APPROVED, user, reason)


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
        if not rbac_is_admin(user) and not getattr(getattr(user, "booking_profile", None), "profile_completed_at", None):
            raise ValidationError("Vui lòng hoàn thiện thông tin cá nhân trước khi gửi đơn.")
        if booking.status == DRAFT and booking.hold_expires_at and booking.hold_expires_at <= timezone.now():
            raise ValidationError("Thời gian giữ phòng của bản nháp đã hết. Vui lòng chọn lại phòng.")
        validate_booking_window(booking.start_time, booking.end_time)
        validate_club_borrowing_policy(booking.start_time, booking.room, user)
        if not all((booking.room_id, booking.activity_name.strip(), booking.description.strip(), booking.participant_count, booking.contact_person.strip(), booking.contact_phone.strip(), booking.contact_email.strip())):
            raise ValidationError("Vui lòng điền đầy đủ phòng, hoạt động, thời gian, số người và thông tin liên hệ trước khi gửi đơn.")
        if not re.fullmatch(r"\+?[0-9][0-9 .-]*", booking.contact_phone) or not 9 <= len(re.sub(r"\D", "", booking.contact_phone)) <= 15:
            raise ValidationError("Số điện thoại/Zalo không hợp lệ.")
        _ensure_room_can_be_booked(booking, booking.room)
        _validate_business_rules(booking, user)
        _validate_no_room_conflict(booking, booking.room)
        _validate_no_blackout_conflict(booking, booking.room)

    if target_status == APPROVED:
        if not booking.scan_confirmed_at:
            raise ValidationError("Cán bộ chưa xác nhận bản scan của đơn.")
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

    if booking.scan_uploaded_at:
        raise ValidationError("Đơn đã nộp bản scan nên không thể tự hết hạn theo mốc scan.")


def _validate_complete_transition(booking):
    if booking.end_time > timezone.now():
        raise ValidationError("Booking chưa qua thời gian kết thúc.")


def _prepare_pending_hold(booking):
    booking.scan_deadline_at = timezone.now() + timedelta(hours=_get_business_rule_int(SCAN_DEADLINE_HOURS_KEY, 24))
    booking.paper_deadline_at = paper_deadline_for(booking.start_time)
    booking.hold_expires_at = booking.scan_deadline_at


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


def _validate_business_rules(booking, actor=None):
    now = timezone.now()
    if booking.start_time <= now:
        raise ValidationError("Thời gian mượn phòng phải ở trong tương lai.")
    admin_override = actor is not None and rbac_is_admin(actor)

    min_advance_hours = _get_business_rule_int(MIN_ADVANCE_HOURS_KEY, 0)
    if not admin_override and min_advance_hours > 0 and booking.start_time < now + timedelta(hours=min_advance_hours):
        raise ValidationError(
            f"Cần đăng ký trước tối thiểu {min_advance_hours} giờ."
        )

    max_advance_days = _get_business_rule_int(MAX_ADVANCE_DAYS_KEY, 0)
    if not admin_override and max_advance_days > 0 and booking.start_time > now + timedelta(days=max_advance_days):
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
    if not admin_override and max_weekly > 0:
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
        not admin_override
        and large_threshold > 0
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
            start_time__lt=buffered_end + timedelta(minutes=max(15, room.buffer_before_minutes)),
            end_time__gt=buffered_start - timedelta(minutes=max(15, room.buffer_after_minutes)),
        )
        .filter(Q(status__in=CONFLICT_STATUSES) | Q(status=DRAFT, hold_expires_at__gt=timezone.now()))
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
    if room is None:
        raise ValidationError("Vui lòng chọn phòng trước khi giữ chỗ.")
    if not booking.participant_count or booking.participant_count < 1:
        raise ValidationError("Số người tham gia phải lớn hơn 0.")
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
        booking.start_time - timedelta(minutes=max(15, room.buffer_before_minutes)),
        booking.end_time + timedelta(minutes=max(15, room.buffer_after_minutes)),
    )


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

    recipients = []
    if target_status == PENDING_HOLD:
        recipients.extend(_notify_admins(notification_type, message, booking))

    recipient = _notify_user(booking.created_by, notification_type, message, booking)
    if recipient:
        recipients.append(recipient)
    if rbac_is_admin(booking.created_by):
        representatives = booking.created_by.__class__.objects.filter(
            booking_profile__organization_id=booking.organization_id,
            booking_profile__role__name="CLB_REP",
            is_active=True,
        ).exclude(pk=booking.created_by_id)
        for representative in representatives:
            if email := _notify_user(representative, notification_type, message, booking):
                recipients.append(email)
    if recipients:
        transaction.on_commit(lambda: _queue_notification_emails(recipients, message))


def _notify_user(user, notification_type, message, booking):
    if not _is_authenticated(user):
        return None
    Notification.objects.create(
        user=user,
        type=notification_type,
        message=message,
        related_booking=booking,
    )
    return getattr(user, "email", None)


def _notify_admins(notification_type, message, booking):
    admin_profiles = (
        booking.created_by.__class__.objects.filter(
            booking_profile__role__name__in=ADMIN_GROUP_NAMES,
            is_active=True,
        )
        .exclude(pk=booking.created_by_id)
        .distinct()
    )
    return [email for admin_user in admin_profiles if (email := _notify_user(admin_user, notification_type, message, booking))]


def _queue_notification_emails(recipients, message):
    if settings.EMAIL_DELIVERY_MODE == "async":
        from backend.bookings.tasks import send_booking_notification_emails

        try:
            send_booking_notification_emails.delay(recipients, message)
            return
        except Exception:
            logger.exception("Could not queue booking notification email; sending directly")

    send_mass_mail(
        [("[Mượn phòng CLB] Cập nhật đơn", message, None, [recipient]) for recipient in recipients],
        fail_silently=True,
    )


def _booking_audit_snapshot(booking):
    return {
        "status": booking.status,
        "physical_status": booking.physical_status,
        "room_id": booking.room_id,
        "secondary_room_id": booking.secondary_room_id,
        "hold_expires_at": _isoformat_or_none(booking.hold_expires_at),
        "physical_confirmed_at": _isoformat_or_none(booking.physical_confirmed_at),
        "physical_confirmed_by_id": booking.physical_confirmed_by_id,
    }


def _isoformat_or_none(value):
    return value.isoformat() if value else None


def _lock_booking(booking):
    if not getattr(booking, "pk", None):
        raise ValidationError("Booking phải được lưu trước khi chuyển trạng thái.")

    return (
        Booking.objects.select_for_update(of=("self",))
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
    "get_available_rooms",
    "reject_booking",
    "request_revision",
    "submit_booking",
    "transition_status",
    "validate_active_booking_schedule",
]
