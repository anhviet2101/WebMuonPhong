import os
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.urls import reverse

from .models import UserProfile


class BootstrapSuperuserTests(TestCase):
    def test_creates_application_admin_only_once(self):
        variables = {
            "BOOTSTRAP_ADMIN_USERNAME": "first_admin",
            "BOOTSTRAP_ADMIN_EMAIL": "first@example.com",
            "BOOTSTRAP_ADMIN_PASSWORD": "LongUniquePass123!",
        }
        with patch.dict(os.environ, variables):
            call_command("bootstrap_superuser")
            user = get_user_model().objects.get(username="first_admin")
            original_password_hash = user.password
            self.assertTrue(user.is_superuser)
            self.assertTrue(user.is_staff)
            self.assertTrue(user.check_password(variables["BOOTSTRAP_ADMIN_PASSWORD"]))
            self.assertEqual(
                UserProfile.objects.get(user=user).role.name, "SUPER_ADMIN"
            )
            login = self.client.post(
                reverse("token_obtain_pair"),
                {
                    "username": "first_admin",
                    "password": variables["BOOTSTRAP_ADMIN_PASSWORD"],
                },
            )
            self.assertEqual(login.status_code, 200)
            self.assertEqual(login.data["user"]["role"], "SUPER_ADMIN")

            with patch.dict(
                os.environ, {"BOOTSTRAP_ADMIN_PASSWORD": "AnotherUniquePass456!"}
            ):
                call_command("bootstrap_superuser")

        user.refresh_from_db()
        self.assertEqual(user.password, original_password_hash)
        self.assertEqual(get_user_model().objects.filter(is_superuser=True).count(), 1)

    def test_does_not_promote_an_existing_regular_user(self):
        user = get_user_model().objects.create_user(
            username="taken", email="taken@example.com", password="UserPass123!"
        )
        with patch.dict(
            os.environ,
            {
                "BOOTSTRAP_ADMIN_USERNAME": "taken",
                "BOOTSTRAP_ADMIN_EMAIL": "taken@example.com",
                "BOOTSTRAP_ADMIN_PASSWORD": "AnotherUniquePass456!",
            },
        ):
            with self.assertRaises(CommandError):
                call_command("bootstrap_superuser")
        user.refresh_from_db()
        self.assertFalse(user.is_superuser)
