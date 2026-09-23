from django.db import migrations


CLUB_PERMISSIONS = (
    "booking.view_own",
    "booking.create",
    "booking.edit_own_before_approval",
    "booking.cancel_own",
    "export.mau_a",
)

OFFICE_PERMISSIONS = (
    "booking.view_own",
    "booking.view_all",
    "booking.create",
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
    "document_template.manage",
    "audit_log.view",
    "export.mau_a",
    "export.mau_b",
)

SUPER_ADMIN_PERMISSIONS = OFFICE_PERMISSIONS + (
    "rule_config.manage",
    "role.manage",
)


def seed_base_roles_and_permissions(apps, schema_editor):
    role_model = apps.get_model("bookings", "Role")
    permission_model = apps.get_model("bookings", "Permission")
    role_permission_model = apps.get_model("bookings", "RolePermission")
    database = schema_editor.connection.alias

    role_specs = (
        ("CLB_REP", "Đại diện câu lạc bộ", CLUB_PERMISSIONS),
        ("YU_ADMIN", "Cán bộ Văn phòng Đoàn - Hội", OFFICE_PERMISSIONS),
        ("SUPER_ADMIN", "Quản trị hệ thống", SUPER_ADMIN_PERMISSIONS),
    )
    for name, description, permission_keys in role_specs:
        role, _ = role_model.objects.using(database).get_or_create(
            name=name, defaults={"description": description}
        )
        for key in permission_keys:
            permission, _ = permission_model.objects.using(database).get_or_create(
                key=key
            )
            role_permission_model.objects.using(database).get_or_create(
                role_id=role.pk, permission_id=permission.pk
            )


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0010_seed_mvp_locations"),
    ]

    operations = [
        migrations.RunPython(seed_base_roles_and_permissions, migrations.RunPython.noop),
    ]
