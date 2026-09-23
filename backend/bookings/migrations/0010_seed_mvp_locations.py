from django.core.validators import MinValueValidator
from django.db import migrations, models


def seed_locations(apps, schema_editor):
    Campus = apps.get_model("bookings", "Campus")
    Building = apps.get_model("bookings", "Building")
    Room = apps.get_model("bookings", "Room")

    km, _ = Campus.objects.get_or_create(
        code="KM", defaults={"name": "Kiều Mai", "active": True}
    )
    xt, _ = Campus.objects.get_or_create(
        code="XT", defaults={"name": "Xuân Thủy", "active": True}
    )
    hl, _ = Campus.objects.get_or_create(
        code="HL", defaults={"name": "Hòa Lạc", "active": True}
    )
    km_a, _ = Building.objects.get_or_create(
        campus=km,
        name="Tòa A",
        defaults={"floor_count": 5, "active": True},
    )
    if km_a.floor_count < 5:
        km_a.floor_count = 5
        km_a.save(update_fields=["floor_count"])
    g2, _ = Building.objects.get_or_create(
        campus=xt,
        name="Nhà G2",
        defaults={"floor_count": 1, "active": True},
    )
    g3, _ = Building.objects.get_or_create(
        campus=xt,
        name="Nhà G3",
        defaults={"floor_count": 1, "active": True},
    )
    multipurpose, _ = Building.objects.get_or_create(
        campus=hl,
        name="Nhà đa năng",
        defaults={"floor_count": 1, "active": True},
    )

    # The confirmed Kiều Mai capacity is 60 per room. G3 is approximately 100.
    for floor in range(1, 6):
        for number in range(1, 8):
            room, created = Room.objects.get_or_create(
                building=km_a,
                name=f"KM-{floor}0{number}",
                defaults={
                    "floor": floor,
                    "capacity": 60,
                    "type": "classroom",
                    "rentable": True,
                    "active": True,
                    "buffer_before_minutes": 15,
                    "buffer_after_minutes": 15,
                },
            )
            if not created and room.capacity != 60:
                room.capacity = 60
                room.save(update_fields=["capacity"])
    for building, name, room_type, capacity, rentable in (
        (g2, "107-G2", "classroom", None, False),
        (g3, "Hội trường G3", "hall", 100, True),
        (multipurpose, "Phòng 1", "multipurpose", None, True),
    ):
        room, created = Room.objects.get_or_create(
            building=building,
            name=name,
            defaults={
                "floor": 1,
                "capacity": capacity,
                "type": room_type,
                "rentable": rentable,
                "active": True,
                "buffer_before_minutes": 15,
                "buffer_after_minutes": 15,
            },
        )
        if not created and building == g3 and room.capacity != 100:
            room.capacity = 100
            room.save(update_fields=["capacity"])
        if not created and building == g2 and room.rentable:
            room.rentable = False
            room.save(update_fields=["rentable"])


class Migration(migrations.Migration):
    dependencies = [("bookings", "0009_include_room_changed_in_conflicts")]

    operations = [
        migrations.AlterField(
            model_name="room",
            name="capacity",
            field=models.PositiveIntegerField(
                null=True, blank=True, validators=[MinValueValidator(1)]
            ),
        ),
        migrations.RunPython(seed_locations, migrations.RunPython.noop),
    ]
