from django.db import migrations, models


def simplify_status(apps, schema_editor):
    Booking = apps.get_model("bookings", "Booking")
    Permission = apps.get_model("bookings", "Permission")
    Booking.objects.filter(physical_status="confirmed_received").update(physical_status="da_nhan_ban_cung")
    Booking.objects.filter(physical_status__in=["not_submitted", "submitted"]).update(physical_status="chua_nhan")
    Permission.objects.filter(key="booking.confirm_physical_submission").delete()


class Migration(migrations.Migration):
    dependencies = [("bookings", "0013_building_archived_at_and_more")]

    operations = [
        migrations.RunPython(simplify_status, migrations.RunPython.noop),
        migrations.RemoveField(model_name="booking", name="scan_file_url"),
        migrations.RemoveField(model_name="booking", name="physical_submitted_at"),
        migrations.AlterField(
            model_name="booking",
            name="physical_status",
            field=models.CharField(
                max_length=32,
                choices=[("chua_nhan", "Chưa nhận"), ("da_nhan_ban_cung", "Đã nhận bản cứng")],
                default="chua_nhan",
                db_index=True,
            ),
        ),
    ]
