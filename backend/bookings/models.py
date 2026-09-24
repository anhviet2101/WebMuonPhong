from datetime import timedelta

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import ArrayField, DateTimeRangeField, RangeOperators
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q


def default_allowed_weekdays():
    return [0, 1, 2, 3, 4, 5]


class BookingStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING_HOLD = "pending_hold", "Pending hold"
    NEEDS_REVISION = "needs_revision", "Needs revision"
    REJECTED = "rejected", "Rejected"
    APPROVED = "approved", "Approved"
    ROOM_CHANGED = "room_changed", "Room changed"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    EXPIRED = "expired", "Expired"


class PhysicalStatus(models.TextChoices):
    CHUA_NHAN = "chua_nhan", "Chưa nhận"
    DA_NHAN_BAN_CUNG = "da_nhan_ban_cung", "Đã nhận bản cứng"


class ApprovalDecision(models.TextChoices):
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    NEEDS_REVISION = "needs_revision", "Needs revision"


class BlackoutScopeType(models.TextChoices):
    ROOM = "room", "Room"
    BUILDING = "building", "Building"
    FLOOR = "floor", "Floor"


class Organization(models.Model):
    name = models.CharField(max_length=255)
    abbreviation = models.CharField(max_length=50, blank=True)
    type = models.CharField(max_length=50)
    representative_name = models.CharField(max_length=255, blank=True)
    hotline = models.CharField(max_length=30, blank=True)
    contact_email = models.EmailField(blank=True)
    fanpage_url = models.URLField(blank=True)
    active = models.BooleanField(default=True)
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.abbreviation or self.name


class Role(models.Model):
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Permission(models.Model):
    key = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return self.key


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        related_name="role_permissions",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["role", "permission"],
                name="unique_permission_per_role",
            ),
        ]

    def __str__(self):
        return f"{self.role} - {self.permission}"


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="booking_profile",
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="user_profiles",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_profiles",
    )
    must_change_password = models.BooleanField(default=False)
    phone = models.CharField(max_length=30, blank=True)
    profile_completed_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    was_active_before_archive = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user} - {self.role}"


class Campus(models.Model):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=20, unique=True)
    address = models.TextField(blank=True)
    active = models.BooleanField(default=True)
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    was_active_before_archive = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "campuses"

    def __str__(self):
        return f"{self.code} - {self.name}"


class Building(models.Model):
    campus = models.ForeignKey(Campus, on_delete=models.PROTECT, related_name="buildings")
    name = models.CharField(max_length=255)
    floor_count = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    active = models.BooleanField(default=True)
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    was_active_before_archive = models.BooleanField(default=True)
    operating_hours_start = models.TimeField(null=True, blank=True)
    operating_hours_end = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ["campus__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["campus", "name"],
                name="unique_building_name_per_campus",
            ),
        ]

    def __str__(self):
        return f"{self.campus.code} - {self.name}"


class Room(models.Model):
    building = models.ForeignKey(Building, on_delete=models.PROTECT, related_name="rooms")
    name = models.CharField(max_length=255)
    floor = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    capacity = models.PositiveIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1)]
    )
    type = models.CharField(max_length=50)
    has_projector = models.BooleanField(default=False)
    has_microphone = models.BooleanField(default=False)
    has_ac = models.BooleanField(default=False)
    has_whiteboard = models.BooleanField(default=False)
    has_sound_system = models.BooleanField(default=False)
    rentable = models.BooleanField(default=True)
    buffer_before_minutes = models.PositiveSmallIntegerField(default=15)
    buffer_after_minutes = models.PositiveSmallIntegerField(default=15)
    notes = models.TextField(blank=True)
    active = models.BooleanField(default=True)
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    was_active_before_archive = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["building__campus__name", "building__name", "floor", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["building", "name"],
                name="unique_room_name_per_building",
            ),
        ]

    def __str__(self):
        return f"{self.building} - {self.name}"


class Booking(models.Model):
    application_group = models.UUIDField(null=True, blank=True, db_index=True, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.PROTECT,
        related_name="bookings",
    )
    room = models.ForeignKey(Room, on_delete=models.PROTECT, null=True, blank=True, related_name="bookings")
    secondary_room = models.ForeignKey(
        Room,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="secondary_bookings",
    )
    activity_name = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    participant_count = models.PositiveIntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
    contact_person = models.CharField(max_length=255, blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    contact_email = models.EmailField(blank=True)
    start_time = models.DateTimeField(null=True, blank=True, db_index=True)
    end_time = models.DateTimeField(null=True, blank=True, db_index=True)
    setup_time_minutes = models.PositiveSmallIntegerField(default=0)
    teardown_time_minutes = models.PositiveSmallIntegerField(default=0)
    equipment_request = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=32,
        choices=BookingStatus.choices,
        default=BookingStatus.DRAFT,
        db_index=True,
    )
    physical_status = models.CharField(
        max_length=32,
        choices=PhysicalStatus.choices,
        default=PhysicalStatus.CHUA_NHAN,
        db_index=True,
    )
    physical_confirmed_at = models.DateTimeField(null=True, blank=True)
    physical_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="physical_confirmed_bookings",
    )
    hold_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    scan_deadline_at = models.DateTimeField(null=True, blank=True, db_index=True)
    paper_deadline_at = models.DateTimeField(null=True, blank=True, db_index=True)
    scan_data = models.BinaryField(null=True, blank=True, editable=False)
    scan_file_name = models.CharField(max_length=255, blank=True)
    scan_content_type = models.CharField(max_length=100, blank=True)
    scan_uploaded_at = models.DateTimeField(null=True, blank=True)
    scan_confirmed_at = models.DateTimeField(null=True, blank=True)
    scan_reupload_requested_at = models.DateTimeField(null=True, blank=True)
    scan_reupload_reason = models.TextField(blank=True)
    scan_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="confirmed_booking_scans",
    )
    during = DateTimeRangeField(null=True, blank=True, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_bookings",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_time"]
        constraints = [
            ExclusionConstraint(
                name="prevent_room_double_booking",
                expressions=[
                    ("room", RangeOperators.EQUAL),
                    ("during", RangeOperators.OVERLAPS),
                ],
                condition=(
                    Q(status__in=[BookingStatus.PENDING_HOLD, BookingStatus.NEEDS_REVISION, BookingStatus.APPROVED, BookingStatus.ROOM_CHANGED])
                    | Q(status=BookingStatus.DRAFT, hold_expires_at__isnull=False)
                ),
            ),
        ]

    def __str__(self):
        return f"{self.activity_name or 'Bản nháp'} ({self.start_time:%Y-%m-%d %H:%M})" if self.start_time else (self.activity_name or "Bản nháp")

    def clean(self):
        super().clean()

        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError({"end_time": "End time must be after start time."})

        if (
            self.room_id
            and self.participant_count
            and self.room.capacity
            and self.participant_count > self.room.capacity
        ):
            raise ValidationError(
                {"participant_count": "Participant count exceeds room capacity."}
            )

    def save(self, *args, **kwargs):
        self.during = self.get_buffered_time_range() if self.start_time and self.end_time and self.room_id else None
        if kwargs.get("update_fields") is not None:
            kwargs["update_fields"] = set(kwargs["update_fields"]) | {"during"}

        super().save(*args, **kwargs)

    def get_buffered_time_range(self):
        buffered_start = self.start_time - timedelta(
            minutes=max(15, self.room.buffer_before_minutes)
        )
        buffered_end = self.end_time + timedelta(minutes=max(15, self.room.buffer_after_minutes))
        return (buffered_start, buffered_end)


class BookingApproval(models.Model):
    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name="approvals",
    )
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="booking_approvals",
    )
    decision = models.CharField(max_length=32, choices=ApprovalDecision.choices)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.booking_id} - {self.decision}"


class RoomBlackout(models.Model):
    scope_type = models.CharField(max_length=20, choices=BlackoutScopeType.choices)
    room_ids = ArrayField(
        models.PositiveBigIntegerField(),
        default=list,
        blank=True,
    )
    building = models.ForeignKey(
        Building,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="blackouts",
    )
    floor = models.PositiveSmallIntegerField(null=True, blank=True)
    start_time = models.DateTimeField(db_index=True)
    end_time = models.DateTimeField(db_index=True)
    is_recurring = models.BooleanField(default=False)
    recurrence_rule = models.TextField(blank=True)
    reason = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_room_blackouts",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_time"]

    def __str__(self):
        return f"{self.scope_type}: {self.start_time:%Y-%m-%d %H:%M}"

    def clean(self):
        super().clean()

        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError({"end_time": "End time must be after start time."})


class BusinessRuleConfig(models.Model):
    key = models.CharField(max_length=100, primary_key=True)
    value = models.JSONField()
    description = models.TextField(blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_business_rule_configs",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self):
        return self.key


class BorrowingPolicy(models.Model):
    """CLB booking days and closed weeks for a campus/building/room scope."""
    campus = models.ForeignKey(Campus, on_delete=models.CASCADE, related_name="borrowing_policies")
    building = models.ForeignKey(Building, on_delete=models.CASCADE, null=True, blank=True, related_name="borrowing_policies")
    room = models.ForeignKey(Room, on_delete=models.CASCADE, null=True, blank=True, related_name="borrowing_policies")
    allowed_weekdays = models.JSONField(default=default_allowed_weekdays)
    locked_weeks = models.JSONField(default=list)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.building_id and self.building.campus_id != self.campus_id:
            raise ValidationError({"building": "Tòa nhà không thuộc cơ sở đã chọn."})
        if self.room_id and (not self.building_id or self.room.building_id != self.building_id):
            raise ValidationError({"room": "Phòng không thuộc tòa nhà đã chọn."})
        if not isinstance(self.allowed_weekdays, list) or any(day not in range(6) for day in self.allowed_weekdays):
            raise ValidationError({"allowed_weekdays": "Ngày được mượn phải trong khoảng thứ Hai đến thứ Bảy."})


class DocumentTemplate(models.Model):
    class TemplateType(models.TextChoices):
        MAU_A = "mau_a", "Mẫu A"
        MAU_B = "mau_b", "Mẫu B"

    template_type = models.CharField(
        max_length=20,
        choices=TemplateType.choices,
        unique=True,
    )
    name = models.CharField(max_length=255)
    content = models.JSONField(default=dict, blank=True)
    active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_document_templates",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["template_type"]

    def __str__(self):
        return self.name


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        NEEDS_REVISION = "needs_revision", "Needs revision"
        ROOM_CHANGED = "room_changed", "Room changed"
        CANCELLED = "cancelled", "Cancelled"
        PHYSICAL_REMINDER = "physical_reminder", "Physical reminder"
        EXPIRED = "expired", "Expired"
        CANCEL_REQUEST = "cancel_request", "Cancel request"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="booking_notifications",
    )
    type = models.CharField(max_length=32, choices=NotificationType.choices)
    message = models.TextField()
    related_booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AuditLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=100, db_index=True)
    entity_type = models.CharField(max_length=100, db_index=True)
    entity_id = models.CharField(max_length=64, db_index=True)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} {self.entity_type}:{self.entity_id}"
