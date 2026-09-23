from django.http import JsonResponse
from django.contrib import admin
from django.urls import include, path

from backend.maintenance import run_booking_maintenance


def health_check(request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("health/", health_check, name="health"),
    path("internal/maintenance/", run_booking_maintenance, name="booking-maintenance"),
    path("admin/", admin.site.urls),
    path("api/", include("backend.bookings.urls")),
]
