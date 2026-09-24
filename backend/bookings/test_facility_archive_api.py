from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import AuditLog, Booking, BookingStatus, Building, Campus, Organization, Role, Room, UserProfile
from .services.booking_service import get_available_rooms


User = get_user_model()


class FacilityArchiveApiTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="CLB Test", type="club")
        self.admin = User.objects.create_user("office", password="OfficePass123!")
        self.club = User.objects.create_user("club", password="ClubPass123!")
        UserProfile.objects.create(user=self.admin, role=Role.objects.get(name="YU_ADMIN"))
        UserProfile.objects.create(
            user=self.club, role=Role.objects.get(name="CLB_REP"),
            organization=self.organization,
        )
        self.campus = Campus.objects.create(name="Cơ sở thử nghiệm", code="FTEST")
        self.building = Building.objects.create(campus=self.campus, name="Tòa A", floor_count=1)
        self.room = Room.objects.create(
            building=self.building, name="101", floor=1, capacity=60, type="classroom"
        )
        self.client.force_authenticate(self.admin)

    def make_booking(self, room=None, secondary_room=None, status=BookingStatus.COMPLETED, future=False):
        start = timezone.now() + timedelta(days=2 if future else -2)
        return Booking.objects.create(
            organization=self.organization, room=room or self.room,
            secondary_room=secondary_room, activity_name="Họp CLB", description="Họp",
            participant_count=20, contact_person="Đại diện", contact_phone="0900000000",
            contact_email="club@example.com", start_time=start,
            end_time=start + timedelta(hours=1), status=status, created_by=self.club,
        )

    def test_archive_restore_each_level_keeps_history_and_prior_active_state(self):
        booking = self.make_booking()
        for name, instance in (("room", self.room), ("building", self.building), ("campus", self.campus)):
            detail = reverse(f"{name}-detail", args=[instance.pk])
            self.assertEqual(self.client.delete(detail).status_code, 204)
            instance.refresh_from_db()
            self.assertIsNotNone(instance.archived_at)
            self.assertFalse(instance.active)
            self.assertFalse(any(item["id"] == instance.pk for item in self.client.get(reverse(f"{name}-list")).data))
            self.assertTrue(any(item["id"] == instance.pk for item in self.client.get(reverse(f"{name}-list") + "?archived=1").data))
            self.assertTrue(Booking.objects.filter(pk=booking.pk).exists())
            history = self.client.get(reverse("booking-detail", args=[booking.pk]))
            self.assertEqual(history.status_code, 200)
            self.assertEqual(history.data["room_name"], "101")
            self.assertEqual(history.data["building_name"], "Tòa A")
            self.assertEqual(self.client.post(reverse(f"{name}-restore", args=[instance.pk])).status_code, 200)
            instance.refresh_from_db()
            self.assertIsNone(instance.archived_at)
            self.assertTrue(instance.active)
            self.assertTrue(AuditLog.objects.filter(action=f"archive_{name}", entity_id=str(instance.pk)).exists())

        self.room.active = False
        self.room.save(update_fields=["active"])
        self.assertEqual(self.client.delete(reverse("room-detail", args=[self.room.pk])).status_code, 204)
        self.assertEqual(self.client.post(reverse("room-restore", args=[self.room.pk])).status_code, 200)
        self.room.refresh_from_db()
        self.assertFalse(self.room.active)

    def test_archiving_parent_hides_children_and_restore_reveals_them(self):
        self.assertEqual(self.client.delete(reverse("campus-detail", args=[self.campus.pk])).status_code, 204)
        self.assertNotIn(self.building.pk, [item["id"] for item in self.client.get(reverse("building-list")).data])
        self.assertNotIn(self.room.pk, [item["id"] for item in self.client.get(reverse("room-list")).data])
        day = timezone.localdate() + timedelta(days=2)
        if day.weekday() == 6:
            day += timedelta(days=1)
        start = timezone.make_aware(datetime.combine(day, time(18, 0)))
        self.assertNotIn(self.room, get_available_rooms(start, start + timedelta(hours=1)))
        self.assertEqual(self.client.post(reverse("campus-restore", args=[self.campus.pk])).status_code, 200)
        self.assertIn(self.building.pk, [item["id"] for item in self.client.get(reverse("building-list")).data])
        self.assertIn(self.room.pk, [item["id"] for item in self.client.get(reverse("room-list")).data])

    def test_future_primary_or_backup_booking_blocks_archive(self):
        second = Room.objects.create(
            building=self.building, name="102", floor=1, capacity=60, type="classroom"
        )
        self.make_booking(status=BookingStatus.APPROVED, future=True, secondary_room=second)
        for name, instance in (("room", self.room), ("room", second), ("building", self.building), ("campus", self.campus)):
            response = self.client.delete(reverse(f"{name}-detail", args=[instance.pk]))
            self.assertEqual(response.status_code, 400)
            instance.refresh_from_db()
            self.assertIsNone(instance.archived_at)

    def test_archived_parent_rejects_new_child_and_club_cannot_archive(self):
        self.assertEqual(self.client.delete(reverse("campus-detail", args=[self.campus.pk])).status_code, 204)
        response = self.client.post(reverse("building-list"), {
            "campus": self.campus.pk, "name": "Tòa B", "floor_count": 1,
        })
        self.assertEqual(response.status_code, 400)
        self.client.force_authenticate(self.club)
        self.assertEqual(self.client.delete(reverse("room-detail", args=[self.room.pk])).status_code, 403)
        self.assertEqual(self.client.get(reverse("campus-list") + "?archived=1").data, [])
