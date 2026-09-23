from secrets import compare_digest

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from backend.bookings.tasks import (
    auto_complete_past_bookings,
    auto_expire_unsubmitted_bookings,
)


@csrf_exempt
@require_POST
def run_booking_maintenance(request):
    """Run the existing idempotent booking jobs from an authenticated scheduler."""

    token = settings.MAINTENANCE_TOKEN
    authorization = request.headers.get("Authorization", "")
    if not token or not compare_digest(authorization, f"Bearer {token}"):
        return HttpResponse(status=404)

    expired = auto_expire_unsubmitted_bookings()
    completed = auto_complete_past_bookings()
    return JsonResponse({"expired": expired, "completed": completed})
