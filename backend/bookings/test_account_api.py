from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import Organization, Role, UserProfile


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
