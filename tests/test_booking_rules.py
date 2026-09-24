from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from backend.bookings.models import (
    Booking,
    BookingStatus,
    Building,
    Campus,
    Organization,
    PhysicalStatus,
    Role,
    Room,
    UserProfile,
)
from backend.bookings.services.booking_service import approve_booking, submit_booking


User = get_user_model()


@pytest.fixture
def booking_context():
    organization = Organization.objects.create(
        name="CLB Kiểm thử",
        abbreviation="TEST",
        type="club",
    )
    other_organization = Organization.objects.create(
        name="CLB Khác",
        abbreviation="OTHER",
        type="club",
    )
    club_role = Role.objects.get_or_create(name="CLB_REP")[0]
    admin_role = Role.objects.get_or_create(name="YU_ADMIN")[0]
    club_user = User.objects.create_user(
        username="club_test",
        password="test-password",
    )
    other_user = User.objects.create_user(
        username="club_other",
        password="test-password",
    )
    admin_user = User.objects.create_user(
        username="admin_test",
        password="test-password",
    )
    UserProfile.objects.create(
        user=club_user,
        role=club_role,
        organization=organization,
    )
    UserProfile.objects.create(
        user=other_user,
        role=club_role,
        organization=other_organization,
    )
    UserProfile.objects.create(user=admin_user, role=admin_role)

    campus, _ = Campus.objects.get_or_create(
        code="KM", defaults={"name": "Kiều Mai"}
    )
    building = Building.objects.create(
        campus=campus,
        name="Nhà A",
        floor_count=3,
    )
    room = Room.objects.create(
        building=building,
        name="KM-101",
        floor=1,
        capacity=50,
        type="classroom",
        buffer_before_minutes=15,
        buffer_after_minutes=15,
    )
    return {
        "organization": organization,
        "other_organization": other_organization,
        "club_user": club_user,
        "other_user": other_user,
        "admin_user": admin_user,
        "room": room,
    }


def make_booking(context, *, activity_name, user=None, organization=None, start=None):
    start = start or timezone.now() + timedelta(days=2)
    return Booking.objects.create(
        organization=organization or context["organization"],
        room=context["room"],
        activity_name=activity_name,
        description="Booking test",
        participant_count=10,
        contact_person="Người phụ trách",
        contact_phone="0900000000",
        contact_email="test@example.com",
        start_time=start,
        end_time=start + timedelta(hours=1),
        created_by=user or context["club_user"],
    )


@pytest.mark.django_db(transaction=True)
def test_double_booking_prevention(booking_context):
    start = timezone.now() + timedelta(days=2)
    first = make_booking(
        booking_context,
        activity_name="Lịch đầu tiên",
        start=start,
    )
    second = make_booking(
        booking_context,
        activity_name="Lịch thứ hai",
        start=start + timedelta(minutes=10),
    )

    submit_booking(first, booking_context["club_user"])

    second.status = BookingStatus.PENDING_HOLD
    second.hold_expires_at = timezone.now() + timedelta(hours=48)
    with pytest.raises(IntegrityError):
        second.save(
            force_insert=False,
            update_fields=["status", "hold_expires_at", "during", "updated_at"],
        )


@pytest.mark.django_db
def test_approve_records_hard_copy_in_one_action(booking_context):
    booking = make_booking(booking_context, activity_name="Ch? b?n c?ng")
    submit_booking(booking, booking_context["club_user"])
    approved = approve_booking(booking, booking_context["admin_user"])
    assert approved.status == BookingStatus.APPROVED
    assert approved.physical_status == PhysicalStatus.DA_NHAN_BAN_CUNG
    assert approved.physical_confirmed_by == booking_context["admin_user"]


@pytest.mark.django_db
def test_club_data_isolation(booking_context):
    own_booking = make_booking(
        booking_context,
        activity_name="Đơn của CLB kiểm thử",
    )
    make_booking(
        booking_context,
        activity_name="Đơn của CLB khác",
        user=booking_context["other_user"],
        organization=booking_context["other_organization"],
        start=timezone.now() + timedelta(days=3),
    )

    client = APIClient()
    client.force_authenticate(user=booking_context["club_user"])
    response = client.get(reverse("booking-list"))

    assert response.status_code == 200
    returned_ids = {item["id"] for item in response.data}
    assert returned_ids == {own_booking.id}
