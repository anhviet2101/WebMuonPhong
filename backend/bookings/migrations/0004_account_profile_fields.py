from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("bookings", "0003_notification")]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="contact_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="organization",
            name="contact_phone",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name="organization",
            name="contact_email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="must_change_password",
            field=models.BooleanField(default=False),
        ),
    ]
