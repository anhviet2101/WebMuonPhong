from celery import shared_task
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from django.contrib.auth import get_user_model
from backend.bookings.models import Booking, BookingStatus, PhysicalStatus, Notification
from backend.bookings.services.booking_service import release_expired_drafts, transition_status


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def send_booking_notification_emails(recipients, message):
    for recipient in recipients:
        send_mail(
            subject="[Mượn phòng CLB] Cập nhật đơn",
            message=message,
            from_email=None,
            recipient_list=[recipient],
        )


@shared_task
def auto_release_expired_draft_holds():
    return release_expired_drafts()


@shared_task
def auto_expire_unsubmitted_bookings():
    now = timezone.now()
    booking_ids = list(
        Booking.objects.filter(
            status__in=[BookingStatus.PENDING_HOLD, BookingStatus.NEEDS_REVISION],
            physical_status=PhysicalStatus.CHUA_NHAN,
            scan_uploaded_at__isnull=True,
            scan_deadline_at__lt=now,
        ).values_list("id", flat=True)
    )
    expired_count = 0

    for booking_id in booking_ids:
        with transaction.atomic():
            booking = (
                Booking.objects.select_for_update()
                .select_related("created_by")
                .get(pk=booking_id)
            )
            if not (
                booking.status in {BookingStatus.PENDING_HOLD, BookingStatus.NEEDS_REVISION}
                and booking.physical_status == PhysicalStatus.CHUA_NHAN
                and not booking.scan_uploaded_at
                and booking.scan_deadline_at
                and booking.scan_deadline_at < timezone.now()
            ):
                continue

            transition_status(booking, BookingStatus.EXPIRED, booking.created_by)
            expired_count += 1

    return expired_count


@shared_task
def warn_overdue_physical_copies():
    """Alert staff to contact clubs; overdue paper never releases the room."""
    admins = list(get_user_model().objects.filter(booking_profile__role__name__in=["YU_ADMIN", "SUPER_ADMIN", "VP_DOAN", "VAN_PHONG_DOAN"], is_active=True).distinct())
    count = 0
    for booking in Booking.objects.filter(status__in=[BookingStatus.PENDING_HOLD, BookingStatus.NEEDS_REVISION], physical_status=PhysicalStatus.CHUA_NHAN, paper_deadline_at__lt=timezone.now()).select_related("organization"):
        for admin in admins:
            _, created = Notification.objects.get_or_create(
                user=admin, type=Notification.NotificationType.PHYSICAL_REMINDER, related_booking=booking,
                defaults={"message": f"Đơn {booking.pk} của {booking.organization.name} quá hạn bản cứng. Vui lòng liên hệ đơn vị để nộp."},
            )
            count += int(created)
    return count


@shared_task
def auto_complete_past_bookings():
    booking_ids = list(
        Booking.objects.filter(
            status__in=[
                BookingStatus.APPROVED,
                BookingStatus.ROOM_CHANGED,
            ],
            end_time__lt=timezone.now(),
        ).values_list("id", flat=True)
    )
    completed_count = 0

    for booking_id in booking_ids:
        with transaction.atomic():
            booking = Booking.objects.select_for_update().get(pk=booking_id)
            if booking.status not in {
                BookingStatus.APPROVED,
                BookingStatus.ROOM_CHANGED,
            } or booking.end_time >= timezone.now():
                continue

            transition_status(booking, BookingStatus.COMPLETED, booking.created_by)
            completed_count += 1

    return completed_count
