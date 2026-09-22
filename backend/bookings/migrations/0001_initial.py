import django.contrib.postgres.fields
import django.contrib.postgres.fields.ranges
import django.db.models.deletion
from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import RangeOperators
from django.contrib.postgres.operations import BtreeGistExtension
from django.core.validators import MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        BtreeGistExtension(),
        migrations.CreateModel(
            name="Campus",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("code", models.CharField(max_length=20, unique=True)),
                ("address", models.TextField(blank=True)),
                ("active", models.BooleanField(default=True)),
            ],
            options={
                "verbose_name_plural": "campuses",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="Organization",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("abbreviation", models.CharField(blank=True, max_length=50)),
                ("type", models.CharField(max_length=50)),
                ("active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="Building",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                (
                    "floor_count",
                    models.PositiveSmallIntegerField(
                        validators=[MinValueValidator(1)]
                    ),
                ),
                ("active", models.BooleanField(default=True)),
                ("operating_hours_start", models.TimeField(blank=True, null=True)),
                ("operating_hours_end", models.TimeField(blank=True, null=True)),
                (
                    "campus",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="buildings",
                        to="bookings.campus",
                    ),
                ),
            ],
            options={
                "ordering": ["campus__name", "name"],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("campus", "name"),
                        name="unique_building_name_per_campus",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="Room",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                (
                    "floor",
                    models.PositiveSmallIntegerField(
                        validators=[MinValueValidator(1)]
                    ),
                ),
                (
                    "capacity",
                    models.PositiveIntegerField(validators=[MinValueValidator(1)]),
                ),
                ("type", models.CharField(max_length=50)),
                ("has_projector", models.BooleanField(default=False)),
                ("has_microphone", models.BooleanField(default=False)),
                ("has_ac", models.BooleanField(default=False)),
                ("has_whiteboard", models.BooleanField(default=False)),
                ("has_sound_system", models.BooleanField(default=False)),
                ("rentable", models.BooleanField(default=True)),
                ("buffer_before_minutes", models.PositiveSmallIntegerField(default=15)),
                ("buffer_after_minutes", models.PositiveSmallIntegerField(default=15)),
                ("notes", models.TextField(blank=True)),
                ("active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "building",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="rooms",
                        to="bookings.building",
                    ),
                ),
            ],
            options={
                "ordering": [
                    "building__campus__name",
                    "building__name",
                    "floor",
                    "name",
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("building", "name"),
                        name="unique_room_name_per_building",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="Booking",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("activity_name", models.CharField(max_length=255)),
                ("description", models.TextField()),
                (
                    "participant_count",
                    models.PositiveIntegerField(validators=[MinValueValidator(1)]),
                ),
                ("contact_person", models.CharField(max_length=255)),
                ("contact_phone", models.CharField(max_length=30)),
                ("contact_email", models.EmailField(max_length=254)),
                ("start_time", models.DateTimeField(db_index=True)),
                ("end_time", models.DateTimeField(db_index=True)),
                ("setup_time_minutes", models.PositiveSmallIntegerField(default=0)),
                ("teardown_time_minutes", models.PositiveSmallIntegerField(default=0)),
                ("equipment_request", models.JSONField(blank=True, default=dict)),
                ("notes", models.TextField(blank=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "Draft"),
                            ("pending_hold", "Pending hold"),
                            ("needs_revision", "Needs revision"),
                            ("rejected", "Rejected"),
                            ("approved", "Approved"),
                            ("room_changed", "Room changed"),
                            ("completed", "Completed"),
                            ("cancelled", "Cancelled"),
                            ("expired", "Expired"),
                        ],
                        db_index=True,
                        default="draft",
                        max_length=32,
                    ),
                ),
                (
                    "physical_status",
                    models.CharField(
                        choices=[
                            ("not_submitted", "Not submitted"),
                            ("submitted", "Submitted"),
                            ("confirmed_received", "Confirmed received"),
                        ],
                        db_index=True,
                        default="not_submitted",
                        max_length=32,
                    ),
                ),
                ("scan_file_url", models.URLField(blank=True, max_length=2048)),
                ("physical_submitted_at", models.DateTimeField(blank=True, null=True)),
                ("physical_confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("hold_expires_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                (
                    "during",
                    django.contrib.postgres.fields.ranges.DateTimeRangeField(
                        editable=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="created_bookings",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="bookings",
                        to="bookings.organization",
                    ),
                ),
                (
                    "physical_confirmed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="physical_confirmed_bookings",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "room",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="bookings",
                        to="bookings.room",
                    ),
                ),
                (
                    "secondary_room",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="secondary_bookings",
                        to="bookings.room",
                    ),
                ),
            ],
            options={
                "ordering": ["-start_time"],
            },
        ),
        migrations.CreateModel(
            name="AuditLog",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("action", models.CharField(db_index=True, max_length=100)),
                ("entity_type", models.CharField(db_index=True, max_length=100)),
                ("entity_id", models.CharField(db_index=True, max_length=64)),
                ("old_value", models.JSONField(blank=True, null=True)),
                ("new_value", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="BookingApproval",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "decision",
                    models.CharField(
                        choices=[
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                            ("needs_revision", "Needs revision"),
                        ],
                        max_length=32,
                    ),
                ),
                ("comment", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "approver",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="booking_approvals",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "booking",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="approvals",
                        to="bookings.booking",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="BusinessRuleConfig",
            fields=[
                ("key", models.CharField(max_length=100, primary_key=True, serialize=False)),
                ("value", models.JSONField()),
                ("description", models.TextField(blank=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="updated_business_rule_configs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["key"],
            },
        ),
        migrations.CreateModel(
            name="RoomBlackout",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "scope_type",
                    models.CharField(
                        choices=[
                            ("room", "Room"),
                            ("building", "Building"),
                            ("floor", "Floor"),
                        ],
                        max_length=20,
                    ),
                ),
                (
                    "room_ids",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.PositiveBigIntegerField(),
                        blank=True,
                        default=list,
                        size=None,
                    ),
                ),
                ("floor", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("start_time", models.DateTimeField(db_index=True)),
                ("end_time", models.DateTimeField(db_index=True)),
                ("is_recurring", models.BooleanField(default=False)),
                ("recurrence_rule", models.TextField(blank=True)),
                ("reason", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "building",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="blackouts",
                        to="bookings.building",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="created_room_blackouts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-start_time"],
            },
        ),
        migrations.AddConstraint(
            model_name="booking",
            constraint=ExclusionConstraint(
                name="prevent_room_double_booking",
                expressions=[
                    ("room", RangeOperators.EQUAL),
                    ("during", RangeOperators.OVERLAPS),
                ],
                condition=models.Q(("status__in", ["pending_hold", "approved"])),
            ),
        ),
    ]
