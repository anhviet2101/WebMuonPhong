import django.contrib.postgres.constraints
import django.contrib.postgres.fields.ranges
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0008_refresh_document_templates_vietnamese"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="booking",
            name="prevent_room_double_booking",
        ),
        migrations.AddConstraint(
            model_name="booking",
            constraint=django.contrib.postgres.constraints.ExclusionConstraint(
                name="prevent_room_double_booking",
                expressions=[
                    ("room", django.contrib.postgres.fields.ranges.RangeOperators.EQUAL),
                    ("during", django.contrib.postgres.fields.ranges.RangeOperators.OVERLAPS),
                ],
                condition=models.Q(
                    (
                        "status__in",
                        [
                            "pending_hold",
                            "approved",
                            "room_changed",
                        ],
                    )
                ),
            ),
        ),
    ]
