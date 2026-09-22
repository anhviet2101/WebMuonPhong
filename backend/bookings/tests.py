from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from backend.bookings.models import (
    Booking,
    BookingStatus,
    Building,
    Campus,
    Organization,
    Notification,
    Permission,
    Role,
    RolePermission,
    Room,
    UserProfile,
)
from backend.bookings.services.booking_service import (
    approve_booking,
    submit_booking,
)
from backend.bookings.tasks import (
    auto_complete_past_bookings,
    auto_expire_unsubmitted_bookings,
)


User = get_user_model()


class BookingApiTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.organization = Organization.objects.create(
            name="CLB A",
            abbreviation="A",
            type="club",
        )
        self.other_organization = Organization.objects.create(
            name="CLB B",
            abbreviation="B",
            type="club",
        )
        self.role = Role.objects.create(name="CLB_REP")
        self.user = User.objects.create_user("club-a", password="password")
        self.other_user = User.objects.create_user("club-b", password="password")
        UserProfile.objects.create(
            user=self.user,
            role=self.role,
            organization=self.organization,
        )
        UserProfile.objects.create(
            user=self.other_user,
            role=self.role,
            organization=self.other_organization,
        )

        campus = Campus.objects.create(name="Campus 1", code="C1")
        building = Building.objects.create(
            campus=campus,
            name="Building 1",
            floor_count=3,
        )
        self.room = Room.objects.create(
            building=building,
            name="101",
            floor=1,
            capacity=50,
            type="classroom",
        )

    def _booking(self, user=None, organization=None, room=None, start_offset=1):
        start = timezone.now() + timedelta(days=start_offset)
        return Booking.objects.create(
            organization=organization or self.organization,
            room=room or self.room,
            activity_name="Weekly meeting",
            description="Meeting",
            participant_count=10,
            contact_person="Representative",
            contact_phone="0900000000",
            contact_email="club@example.com",
            start_time=start,
            end_time=start + timedelta(hours=2),
            created_by=user or self.user,
        )

    def test_booking_list_is_limited_to_user_organization(self):
        own_booking = self._booking()
        self._booking(
            user=self.other_user,
            organization=self.other_organization,
            start_offset=2,
        )

        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("booking-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [own_booking.id])

    def test_approve_requires_confirmed_physical_copy(self):
        booking = self._booking()
        submit_booking(booking, self.user)
        admin = User.objects.create_user(
            "admin",
            password="password",
            is_staff=True,
        )

        with self.assertRaisesMessage(ValidationError, "Chưa nhận bản cứng từ CLB"):
            approve_booking(booking, admin)

    def test_available_rooms_excludes_conflicting_booking(self):
        booking = self._booking()
        submit_booking(booking, self.user)

        self.client.force_authenticate(self.user)
        response = self.client.get(
            reverse("room-available"),
            {
                "start_time": booking.start_time.isoformat(),
                "end_time": booking.end_time.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.room.id, [item["id"] for item in response.data])


class BookingConflictServiceTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name="CLB",
            abbreviation="CLB",
            type="club",
        )
        role = Role.objects.create(name="CLB_REP")
        permission = Permission.objects.create(key="booking.create")
        RolePermission.objects.create(role=role, permission=permission)
        self.user = User.objects.create_user("club", password="password")
        UserProfile.objects.create(
            user=self.user,
            role=role,
            organization=self.organization,
        )
        campus = Campus.objects.create(name="Campus", code="C")
        building = Building.objects.create(
            campus=campus,
            name="Building",
            floor_count=2,
        )
        self.room = Room.objects.create(
            building=building,
            name="101",
            floor=1,
            capacity=20,
            type="classroom",
        )

    def test_submit_rejects_overlapping_hold(self):
        start = timezone.now() + timedelta(days=1)
        first = Booking.objects.create(
            organization=self.organization,
            room=self.room,
            activity_name="First",
            description="First",
            participant_count=5,
            contact_person="Person",
            contact_phone="0900000000",
            contact_email="club@example.com",
            start_time=start,
            end_time=start + timedelta(hours=1),
            created_by=self.user,
        )
        second = Booking.objects.create(
            organization=self.organization,
            room=self.room,
            activity_name="Second",
            description="Second",
            participant_count=5,
            contact_person="Person",
            contact_phone="0900000000",
            contact_email="club@example.com",
            start_time=start + timedelta(minutes=10),
            end_time=start + timedelta(hours=1, minutes=10),
            created_by=self.user,
        )

        submit_booking(first, self.user)
        with self.assertRaisesMessage(
            ValidationError,
            "Phòng đã có lịch trùng trong khoảng thời gian này.",
        ):
            submit_booking(second, self.user)

        second.refresh_from_db()
        self.assertEqual(second.status, BookingStatus.DRAFT)


class BookingMaintenanceTaskTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name="CLB",
            abbreviation="CLB",
            type="club",
        )
        role = Role.objects.create(name="CLB_REP")
        self.user = User.objects.create_user("club", password="password")
        UserProfile.objects.create(
            user=self.user,
            role=role,
            organization=self.organization,
        )
        campus = Campus.objects.create(name="Campus", code="C")
        building = Building.objects.create(
            campus=campus,
            name="Building",
            floor_count=2,
        )
        self.room = Room.objects.create(
            building=building,
            name="101",
            floor=1,
            capacity=20,
            type="classroom",
        )

    def test_expire_task_updates_booking_audit_and_notification(self):
        start = timezone.now() + timedelta(days=1)
        booking = Booking.objects.create(
            organization=self.organization,
            room=self.room,
            activity_name="Expired request",
            description="Request",
            participant_count=5,
            contact_person="Person",
            contact_phone="0900000000",
            contact_email="club@example.com",
            start_time=start,
            end_time=start + timedelta(hours=1),
            status=BookingStatus.PENDING_HOLD,
            hold_expires_at=timezone.now() - timedelta(minutes=1),
            created_by=self.user,
        )

        self.assertEqual(auto_expire_unsubmitted_bookings(), 1)

        booking.refresh_from_db()
        self.assertEqual(booking.status, BookingStatus.EXPIRED)
        self.assertTrue(booking.created_by.audit_logs.filter(entity_id=str(booking.id)).exists())
        self.assertTrue(
            Notification.objects.filter(
                user=self.user,
                related_booking=booking,
                type=Notification.NotificationType.EXPIRED,
            ).exists()
        )

    def test_complete_task_updates_past_booking(self):
        end = timezone.now() - timedelta(minutes=1)
        booking = Booking.objects.create(
            organization=self.organization,
            room=self.room,
            activity_name="Past booking",
            description="Booking",
            participant_count=5,
            contact_person="Person",
            contact_phone="0900000000",
            contact_email="club@example.com",
            start_time=end - timedelta(hours=1),
            end_time=end,
            status=BookingStatus.APPROVED,
            created_by=self.user,
        )

        self.assertEqual(auto_complete_past_bookings(), 1)

        booking.refresh_from_db()
        self.assertEqual(booking.status, BookingStatus.COMPLETED)
