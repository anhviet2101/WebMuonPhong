from django.db import migrations


def release_legacy_drafts(apps, schema_editor):
    # Old draft rows never reserved a room. Some overlap approved bookings, so
    # let their owners choose an available room under the new one-hour rule.
    apps.get_model("bookings", "Booking").objects.filter(
        status="draft", hold_expires_at__isnull=True, room__isnull=False,
    ).update(room=None, secondary_room=None, during=None)


class Migration(migrations.Migration):
    dependencies = [("bookings", "0017_remove_booking_prevent_room_double_booking_and_more")]
    operations = [migrations.RunPython(release_legacy_drafts, migrations.RunPython.noop)]
