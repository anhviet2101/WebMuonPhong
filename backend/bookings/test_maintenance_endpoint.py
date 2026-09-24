from django.test import Client, TestCase, override_settings
from django.urls import reverse


@override_settings(MAINTENANCE_TOKEN="a" * 48)
class MaintenanceEndpointTests(TestCase):
    def test_only_authorized_post_can_run_maintenance(self):
        url = reverse("booking-maintenance")
        self.assertEqual(self.client.get(url).status_code, 405)
        self.assertEqual(self.client.post(url).status_code, 404)
        self.assertEqual(
            self.client.post(url, HTTP_AUTHORIZATION="Bearer incorrect").status_code,
            404,
        )

        response = Client(enforce_csrf_checks=True).post(
            url, HTTP_AUTHORIZATION=f"Bearer {'a' * 48}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"expired": 0, "released_drafts": 0, "completed": 0})

    @override_settings(MAINTENANCE_TOKEN="")
    def test_endpoint_is_disabled_without_token(self):
        response = self.client.post(
            reverse("booking-maintenance"),
            HTTP_AUTHORIZATION=f"Bearer {'a' * 48}",
        )
        self.assertEqual(response.status_code, 404)
