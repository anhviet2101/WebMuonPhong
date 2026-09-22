from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("bookings", "0004_account_profile_fields")]

    operations = [
        migrations.RenameField(
            model_name="organization",
            old_name="contact_name",
            new_name="representative_name",
        ),
        migrations.RenameField(
            model_name="organization",
            old_name="contact_phone",
            new_name="hotline",
        ),
        migrations.AddField(
            model_name="organization",
            name="fanpage_url",
            field=models.URLField(blank=True),
        ),
    ]
