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
    PhysicalStatus,
    Role,
    Room,
    RoomBlackout,
    UserProfile,
)
from backend.bookings.services.booking_service import (
    approve_booking,
    change_room,
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
        self.role = Role.objects.get(name="CLB_REP")
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

    def test_club_can_create_booking_without_supplying_organization(self):
        self.client.force_authenticate(self.user)
        start = timezone.now() + timedelta(days=2)

        response = self.client.post(
            reverse("booking-list"),
            {
                "room": self.room.id,
                "activity_name": "Club meeting",
                "description": "Meeting",
                "participant_count": 10,
                "contact_person": "Representative",
                "contact_phone": "0900000000",
                "contact_email": "club@example.com",
                "start_time": start.isoformat(),
                "end_time": (start + timedelta(hours=1)).isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Booking.objects.get(pk=response.data["id"]).organization, self.organization)
        self.assertEqual(response.data["status"], BookingStatus.PENDING_HOLD)

    def test_create_conflict_does_not_leave_draft(self):
        held = self._booking()
        submit_booking(held, self.user)
        self.client.force_authenticate(self.user)
        response = self.client.post(reverse("booking-list"), {
            "room": self.room.id,
            "activity_name": "Conflicting meeting",
            "description": "Meeting",
            "participant_count": 10,
            "contact_person": "Representative",
            "contact_phone": "0900000000",
            "contact_email": "club@example.com",
            "start_time": held.start_time.isoformat(),
            "end_time": held.end_time.isoformat(),
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Booking.objects.filter(activity_name="Conflicting meeting").exists())

    def test_update_and_submit_draft_saves_changes_and_holds_room(self):
        booking = self._booking()
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("booking-update-and-submit", args=[booking.id]),
            {"activity_name": "Updated meeting", "participant_count": 25},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        booking.refresh_from_db()
        self.assertEqual(booking.activity_name, "Updated meeting")
        self.assertEqual(booking.participant_count, 25)
        self.assertEqual(booking.status, BookingStatus.PENDING_HOLD)
        self.assertIsNotNone(booking.hold_expires_at)

    def test_update_and_submit_conflict_rolls_back_draft_edits(self):
        held = self._booking()
        submit_booking(held, self.user)
        draft = self._booking(start_offset=2)
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("booking-update-and-submit", args=[draft.id]),
            {
                "activity_name": "Should not be saved",
                "start_time": held.start_time.isoformat(),
                "end_time": held.end_time.isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        draft.refresh_from_db()
        self.assertEqual(draft.status, BookingStatus.DRAFT)
        self.assertEqual(draft.activity_name, "Weekly meeting")
        self.assertNotEqual(draft.start_time, held.start_time)

    def test_admin_account_requires_and_keeps_selected_club(self):
        admin_role = Role.objects.get(name="YU_ADMIN")
        admin = User.objects.create_user("office", password="OfficePass123!")
        UserProfile.objects.create(user=admin, role=admin_role)
        self.client.force_authenticate(admin)

        missing = self.client.post(
            reverse("admin-users"),
            {"username": "new-club", "role": "CLB_REP"},
            format="json",
        )
        self.assertEqual(missing.status_code, 400)

        created = self.client.post(
            reverse("admin-users"),
            {
                "username": "new-club",
                "role": "CLB_REP",
                "organization": self.other_organization.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(
            UserProfile.objects.get(user_id=created.data["id"]).organization,
            self.other_organization,
        )

    def test_approve_records_hard_copy(self):
        booking = self._booking()
        submit_booking(booking, self.user)
        admin = User.objects.create_user("admin", password="password", is_staff=True)
        approved = approve_booking(booking, admin)
        self.assertEqual(approved.status, BookingStatus.APPROVED)
        self.assertEqual(approved.physical_status, PhysicalStatus.DA_NHAN_BAN_CUNG)

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

    def test_available_rooms_filters_by_capacity(self):
        self.client.force_authenticate(self.user)
        start = timezone.now() + timedelta(days=3)
        params = {
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=2)).isoformat(),
        }
        enough = self.client.get(reverse("room-available"), {**params, "participant_count": 50})
        too_small = self.client.get(reverse("room-available"), {**params, "participant_count": 51})
        invalid = self.client.get(reverse("room-available"), {**params, "participant_count": 0})
        self.assertEqual(enough.status_code, 200, enough.data)
        self.assertIn(self.room.id, [item["id"] for item in enough.data])
        self.assertEqual(too_small.status_code, 200, too_small.data)
        self.assertNotIn(self.room.id, [item["id"] for item in too_small.data])
        self.assertEqual(invalid.status_code, 400)

    def test_minimum_fifteen_minute_buffer_blocks_room(self):
        self.room.buffer_before_minutes = 0
        self.room.buffer_after_minutes = 0
        self.room.save(update_fields=["buffer_before_minutes", "buffer_after_minutes"])
        booking = self._booking()
        submit_booking(booking, self.user)
        candidate_start = booking.end_time + timedelta(minutes=20)
        candidate_end = candidate_start + timedelta(hours=1)
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("room-available"), {
            "start_time": candidate_start.isoformat(),
            "end_time": candidate_end.isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.room.id, [item["id"] for item in response.data])
        candidate = Booking.objects.create(
            organization=self.organization,
            room=self.room,
            activity_name="Too close to prior booking",
            description="Test buffer",
            participant_count=10,
            contact_person="Representative",
            contact_phone="0900000000",
            contact_email="club@example.com",
            start_time=candidate_start,
            end_time=candidate_end,
            created_by=self.user,
        )
        with self.assertRaisesMessage(ValidationError, "Phòng đã có lịch trùng"):
            submit_booking(candidate, self.user)

    def test_available_rooms_allows_excluding_current_booking(self):
        booking = self._booking()
        submit_booking(booking, self.user)

        self.client.force_authenticate(self.user)
        response = self.client.get(
            reverse("room-available"),
            {
                "start_time": booking.start_time.isoformat(),
                "end_time": booking.end_time.isoformat(),
                "exclude_booking": booking.id,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(self.room.id, [item["id"] for item in response.data])

    def test_available_rooms_excludes_approved_booking(self):
        booking = self._booking()
        submit_booking(booking, self.user)
        admin = User.objects.create_user("approver", password="password", is_staff=True)
        approve_booking(booking, admin)
        self.client.force_authenticate(self.other_user)
        response = self.client.get(reverse("room-available"), {
            "start_time": booking.start_time.isoformat(),
            "end_time": booking.end_time.isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.room.id, [item["id"] for item in response.data])

    def test_available_rooms_respects_blackout_and_buffer(self):
        start = timezone.now() + timedelta(days=2)
        RoomBlackout.objects.create(
            scope_type="room",
            room_ids=[self.room.id],
            start_time=start + timedelta(hours=1, minutes=10),
            end_time=start + timedelta(hours=2),
            reason="Maintenance",
            created_by=self.user,
        )
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("room-available"), {
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=1)).isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.room.id, [item["id"] for item in response.data])

    def test_available_rooms_excludes_room_changed_booking(self):
        booking = self._booking()
        booking.status = BookingStatus.ROOM_CHANGED
        booking.save(update_fields=["status"])
        self.client.force_authenticate(self.other_user)
        response = self.client.get(reverse("room-available"), {
            "start_time": booking.start_time.isoformat(),
            "end_time": booking.end_time.isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.room.id, [item["id"] for item in response.data])

    def test_available_rooms_excludes_building_blackout(self):
        start = timezone.now() + timedelta(days=2)
        RoomBlackout.objects.create(
            scope_type="building",
            room_ids=[],
            building=self.room.building,
            start_time=start,
            end_time=start + timedelta(hours=1),
            reason="Exam",
            created_by=self.user,
        )
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("room-available"), {
            "start_time": start.isoformat(),
            "end_time": (start + timedelta(hours=1)).isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.room.id, [item["id"] for item in response.data])

    def test_edit_cannot_move_active_booking_into_blackout(self):
        booking = self._booking()
        submit_booking(booking, self.user)
        new_start = booking.start_time + timedelta(hours=4)
        RoomBlackout.objects.create(
            scope_type="room",
            room_ids=[self.room.id],
            start_time=new_start,
            end_time=new_start + timedelta(hours=1),
            reason="Maintenance",
            created_by=self.user,
        )
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("booking-detail", args=[booking.id]),
            {
                "start_time": new_start.isoformat(),
                "end_time": (new_start + timedelta(hours=1)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        booking.refresh_from_db()
        self.assertNotEqual(booking.start_time, new_start)

    def test_calendar_redacts_other_club_details(self):
        booking = self._booking(
            user=self.other_user,
            organization=self.other_organization,
        )
        submit_booking(booking, self.other_user)
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("booking-calendar"))
        self.assertEqual(response.status_code, 200)
        item = next(item for item in response.data if item.get("hidden_details"))
        self.assertTrue(item["hidden_details"])
        self.assertNotEqual(item["id"], booking.id)
        self.assertEqual(item["activity_name"], "Không khả dụng")
        self.assertEqual(item["organization_name"], "")

    def test_same_club_representative_can_cancel_booking(self):
        booking = self._booking()
        submit_booking(booking, self.user)
        colleague = User.objects.create_user("club-a-colleague", password="password")
        UserProfile.objects.create(
            user=colleague,
            role=self.role,
            organization=self.organization,
        )
        self.client.force_authenticate(colleague)
        response = self.client.post(reverse("booking-cancel", args=[booking.id]))
        self.assertEqual(response.status_code, 200, response.data)
        booking.refresh_from_db()
        self.assertEqual(booking.status, BookingStatus.CANCELLED)

    def test_admin_can_change_pending_room_without_approving(self):
        booking = self._booking()
        submit_booking(booking, self.user)
        booking.refresh_from_db()
        other_room = Room.objects.create(
            building=self.room.building,
            name="102",
            floor=1,
            capacity=50,
            type="classroom",
        )
        admin = User.objects.create_user("office", password="password", is_staff=True)
        changed = change_room(booking, other_room, admin, reason="Room adjustment")
        self.assertEqual(changed.status, BookingStatus.PENDING_HOLD)
        self.assertEqual(changed.room_id, other_room.id)
        self.assertEqual(changed.hold_expires_at, booking.hold_expires_at)

    def test_approval_rejects_new_blackout(self):
        booking = self._booking()
        submit_booking(booking, self.user)
        admin = User.objects.create_user("office", password="password", is_staff=True)
        RoomBlackout.objects.create(
            scope_type="room",
            room_ids=[self.room.id],
            start_time=booking.start_time,
            end_time=booking.end_time,
            reason="Maintenance",
            created_by=admin,
        )
        with self.assertRaises(ValidationError):
            approve_booking(booking, admin)

    def test_submit_rejects_overlapping_room_booking(self):
        first = self._booking()
        submit_booking(first, self.user)
        second = self._booking(start_offset=1)
        second.start_time = first.start_time + timedelta(minutes=30)
        second.end_time = first.end_time + timedelta(minutes=30)
        second.save(update_fields=["start_time", "end_time", "updated_at"])

        with self.assertRaises(ValidationError):
            submit_booking(second, self.user)

    def test_club_cannot_edit_after_physical_copy_confirmed(self):
        booking = self._booking()
        booking.status = BookingStatus.NEEDS_REVISION
        booking.physical_status = PhysicalStatus.DA_NHAN_BAN_CUNG
        booking.save(update_fields=["status", "physical_status", "updated_at"])

        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("booking-detail", args=[booking.id]),
            {"activity_name": "Updated after hard copy"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        booking.refresh_from_db()
        self.assertEqual(booking.activity_name, "Weekly meeting")

    def test_club_can_edit_pending_hold_before_physical_copy(self):
        booking = self._booking()
        submit_booking(booking, self.user)

        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("booking-detail", args=[booking.id]),
            {"activity_name": "Updated before hard copy"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        booking.refresh_from_db()
        self.assertEqual(booking.activity_name, "Updated before hard copy")


class BookingConflictServiceTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name="CLB",
            abbreviation="CLB",
            type="club",
        )
        role = Role.objects.get(name="CLB_REP")
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
        role = Role.objects.get(name="CLB_REP")
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
