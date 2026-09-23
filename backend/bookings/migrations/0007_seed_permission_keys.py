from django.db import migrations


ADMIN_PERMISSION_KEYS = (
    "organization.manage",
    "campus.manage",
    "building.manage",
    "room.manage",
    "booking.approve",
    "booking.reject",
    "booking.request_revision",
    "booking.change_room",
    "booking.confirm_physical_submission",
    "blackout.manage",
    "rule_config.manage",
    "document_template.manage",
    "audit_log.view",
    "export.mau_a",
    "export.mau_b",
)

CLUB_PERMISSION_KEYS = (
    "booking.view_own",
    "booking.create",
    "booking.edit_own_before_approval",
    "booking.cancel_own",
    "export.mau_a",
)


def seed_permissions(apps, schema_editor):
    role = apps.get_model("bookings", "Role")
    permission = apps.get_model("bookings", "Permission")
    role_permission = apps.get_model("bookings", "RolePermission")

    if not role.objects.filter(name__in=["YU_ADMIN", "SUPER_ADMIN", "CLB_REP"]).exists():
        return

    permission_by_key = {}
    for key in set(ADMIN_PERMISSION_KEYS) | set(CLUB_PERMISSION_KEYS):
        permission_by_key[key], _ = permission.objects.get_or_create(key=key)

    for admin_role in role.objects.filter(name__in=["YU_ADMIN", "SUPER_ADMIN"]):
        for key in ADMIN_PERMISSION_KEYS:
            role_permission.objects.get_or_create(
                role=admin_role,
                permission=permission_by_key[key],
            )

    for club_role in role.objects.filter(name="CLB_REP"):
        for key in CLUB_PERMISSION_KEYS:
            role_permission.objects.get_or_create(
                role=club_role,
                permission=permission_by_key[key],
            )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0006_documenttemplate"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, noop_reverse),
    ]
