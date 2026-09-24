from django.test import SimpleTestCase
from django.test.utils import override_settings


@override_settings(
    DEBUG=False,
    SECURE_SSL_REDIRECT=True,
    ALLOWED_HOSTS=["webmuonphong.onrender.com"],
)
class HealthCheckTests(SimpleTestCase):
    def test_internal_http_health_check_returns_ok(self):
        response = self.client.get(
            "/health/", HTTP_HOST="webmuonphong.onrender.com:10000"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_other_http_requests_still_redirect_to_https(self):
        response = self.client.get("/admin/", HTTP_HOST="webmuonphong.onrender.com")
        self.assertEqual(response.status_code, 301)
