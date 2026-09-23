from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import AuditLog, Booking, Building, Campus, Organization, Role, Room, UserProfile


User = get_user_model()


class AccountApiTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name="CLB Test", type="club", contact_email="old@example.com"
        )
        self.role = Role.objects.get(name="CLB_REP")
        self.admin_role = Role.objects.get(name="YU_ADMIN")
        self.user = User.objects.create_user(
            username="representative", email="rep@example.com", password="OldPass123!"
        )
        UserProfile.objects.create(
            user=self.user, role=self.role, organization=self.organization,
            must_change_password=True,
        )

    def test_login_accepts_email_and_returns_account_claims(self):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "rep@example.com", "password": "OldPass123!"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["user"]["must_change_password"])
        self.assertEqual(response.data["user"]["organization_id"], self.organization.id)

    def test_change_password_clears_first_login_flag(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse("change-password"),
            {"old_password": "OldPass123!", "new_password": "NewPass123!"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            UserProfile.objects.get(user=self.user).must_change_password
        )

    def test_club_rep_can_update_only_organization_contacts(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("organization-profile"),
            {"representative_name": "Nguyen Van A", "hotline": "0900000000"},
        )
        self.assertEqual(response.status_code, 200)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.representative_name, "Nguyen Van A")
        self.assertEqual(self.organization.hotline, "0900000000")

        response = self.client.patch(
            reverse("organization-profile"), {"active": False}
        )
        self.assertEqual(response.status_code, 400)


class AccountArchiveApiTests(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="CLB Test", type="club")
        club_role = Role.objects.get(name="CLB_REP")
        office_role = Role.objects.get(name="YU_ADMIN")
        self.representative = User.objects.create_user("representative", password="OldPass123!")
        UserProfile.objects.create(
            user=self.representative, role=club_role, organization=self.organization
        )
        self.admin = User.objects.create_user("office", password="OfficePass123!")
        UserProfile.objects.create(user=self.admin, role=office_role)

    def _booking(self):
        campus = Campus.objects.create(name="Campus", code="TEST")
        building = Building.objects.create(campus=campus, name="Building", floor_count=1)
        room = Room.objects.create(
            building=building, name="101", floor=1, capacity=60, type="classroom"
        )
        start = timezone.now() + timedelta(days=2)
        return Booking.objects.create(
            organization=self.organization,
            room=room,
            activity_name="Past request",
            description="Meeting",
            participant_count=20,
            contact_person="Representative",
            contact_phone="0900000000",
            contact_email="club@example.com",
            start_time=start,
            end_time=start + timedelta(hours=1),
            created_by=self.representative,
        )

    def test_archive_and_restore_account_preserves_booking(self):
        booking = self._booking()
        token = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "representative", "password": "OldPass123!"},
        ).data["access"]
        self.client.force_authenticate(self.admin)
        detail = reverse("admin-user-detail", args=[self.representative.pk])
        response = self.client.delete(detail)
        self.assertEqual(response.status_code, 204)
        self.representative.refresh_from_db()
        self.assertFalse(self.representative.is_active)
        self.assertIsNotNone(self.representative.booking_profile.archived_at)
        self.assertTrue(Booking.objects.filter(pk=booking.pk).exists())
        self.assertNotIn(
            self.representative.pk,
            [item["id"] for item in self.client.get(reverse("admin-users")).data],
        )
        self.assertIn(
            self.representative.pk,
            [item["id"] for item in self.client.get(reverse("admin-users") + "?archived=1").data],
        )
        archive_log = AuditLog.objects.get(
            action="archive_user", entity_id=str(self.representative.pk)
        )
        self.assertIsNone(archive_log.old_value["archived_at"])
        self.assertIsNotNone(archive_log.new_value["archived_at"])
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(self.client.get(reverse("auth-me")).status_code, 401)
        self.client.credentials()
        self.assertNotEqual(
            self.client.post(
                reverse("token_obtain_pair"),
                {"username": "representative", "password": "OldPass123!"},
            ).status_code,
            200,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(reverse("admin-user-restore", args=[self.representative.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_active"])
        self.representative.refresh_from_db()
        self.assertTrue(self.representative.is_active)
        self.assertIsNone(self.representative.booking_profile.archived_at)
        self.assertTrue(Booking.objects.filter(pk=booking.pk).exists())

    def test_archive_and_restore_club_keeps_accounts_disabled_until_restored(self):
        booking = self._booking()
        self.client.force_authenticate(self.admin)
        detail = reverse("organization-detail", args=[self.organization.pk])
        self.assertEqual(self.client.delete(detail).status_code, 204)
        self.organization.refresh_from_db()
        self.representative.refresh_from_db()
        self.assertFalse(self.organization.active)
        self.assertIsNotNone(self.organization.archived_at)
        self.assertFalse(self.representative.is_active)
        self.assertTrue(Booking.objects.filter(pk=booking.pk).exists())
        self.assertEqual(self.client.get(reverse("organization-list")).data, [])
        self.assertEqual(len(self.client.get(reverse("organization-list") + "?archived=1").data), 1)
        self.assertEqual(
            self.client.post(reverse("admin-user-restore", args=[self.representative.pk])).status_code,
            400,
        )

        self.assertEqual(
            self.client.post(reverse("organization-restore", args=[self.organization.pk])).status_code,
            200,
        )
        self.representative.refresh_from_db()
        self.assertFalse(self.representative.is_active)
        self.assertEqual(
            self.client.post(reverse("admin-user-restore", args=[self.representative.pk])).status_code,
            200,
        )
        self.representative.refresh_from_db()
        self.assertTrue(self.representative.is_active)

    def test_archive_refuses_non_admin_and_admin_accounts(self):
        self.client.force_authenticate(self.representative)
        self.assertEqual(
            self.client.delete(reverse("organization-detail", args=[self.organization.pk])).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(reverse("admin-user-detail", args=[self.representative.pk])).status_code,
            403,
        )
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.delete(reverse("admin-user-detail", args=[self.admin.pk])).status_code,
            403,
        )

    def test_restoring_archived_locked_account_keeps_it_locked(self):
        self.representative.is_active = False
        self.representative.save(update_fields=["is_active"])
        self.client.force_authenticate(self.admin)
        detail = reverse("admin-user-detail", args=[self.representative.pk])
        self.assertEqual(self.client.delete(detail).status_code, 204)
        self.assertEqual(
            self.client.post(reverse("admin-user-restore", args=[self.representative.pk])).status_code,
            200,
        )
        self.representative.refresh_from_db()
        self.assertFalse(self.representative.is_active)
