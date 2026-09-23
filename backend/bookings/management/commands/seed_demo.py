from datetime import timedelta

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone

from backend.bookings.models import (
    Booking,
    BookingStatus,
    Building,
    Campus,
    Organization,
    Permission,
    PhysicalStatus,
    Role,
    RolePermission,
    Room,
    UserProfile,
)


class Command(BaseCommand):
    help = "Create or update local demo users, locations, organizations, and bookings."

    def handle(self, *args, **options):
        admin_role = self._role("YU_ADMIN", "Văn phòng Đoàn")
        club_role = self._role("CLB_REP", "Đại diện câu lạc bộ")
        self._grant_admin_permissions(admin_role)
        self._grant_club_permissions(club_role)

        org_a = self._organization(
            "CLB Công nghệ thông tin",
            "IT CLUB",
            "Nguyễn Minh Anh",
            "0901000001",
            "itclub@example.com",
        )
        org_b = self._organization(
            "CLB Truyền thông",
            "MEDIA CLUB",
            "Trần Thu Hà",
            "0901000002",
            "mediaclub@example.com",
        )

        admin = self._user(
            "admin",
            "admin@example.com",
            "123456a@",
            admin_role,
            None,
            is_staff=True,
            is_superuser=True,
        )
        club_a = self._user(
            "clb1",
            "it.rep@example.com",
            "1234",
            club_role,
            org_a,
        )
        club_b = self._user(
            "clb2",
            "media.rep@example.com",
            "1234",
            club_role,
            org_b,
        )

        campus = Campus.objects.update_or_create(
            code="KM",
            defaults={"name": "Cơ sở Kiều Mai", "address": "Kiều Mai, Hà Nội", "active": True},
        )[0]
        building = Building.objects.update_or_create(
            campus=campus,
            name="Tòa A",
            defaults={"floor_count": 5, "active": True},
        )[0]
        room_a = self._room(building, "KM-101", 1, 60, has_projector=True)
        room_b = self._room(building, "KM-102", 1, 60, has_projector=True, has_ac=True)
        room_c = self._room(building, "KM-201", 2, 60, has_projector=True, has_microphone=True, has_ac=True)

        base = timezone.now().replace(minute=0, second=0, microsecond=0)
        self._booking(
            "Demo - Họp CLB Công nghệ",
            org_a,
            room_a,
            club_a,
            base + timedelta(days=2, hours=2),
            base + timedelta(days=2, hours=4),
            BookingStatus.PENDING_HOLD,
            PhysicalStatus.NOT_SUBMITTED,
        )
        self._booking(
            "Demo - Workshop truyền thông",
            org_b,
            room_b,
            club_b,
            base + timedelta(days=3, hours=3),
            base + timedelta(days=3, hours=6),
            BookingStatus.APPROVED,
            PhysicalStatus.CONFIRMED_RECEIVED,
        )
        self._booking(
            "Demo - Sinh hoạt chung",
            org_a,
            room_c,
            club_a,
            base + timedelta(days=5, hours=1),
            base + timedelta(days=5, hours=3),
            BookingStatus.NEEDS_REVISION,
            PhysicalStatus.SUBMITTED,
        )

        self.stdout.write(self.style.SUCCESS("Đã tạo/cập nhật dữ liệu demo thành công."))
        self.stdout.write("Admin: admin / 123456a@")
        self.stdout.write("CLB 1: clb1 / 1234")
        self.stdout.write("CLB 2: clb2 / 1234")

    @staticmethod
    def _role(name, description):
        return Role.objects.get_or_create(name=name, defaults={"description": description})[0]

    @staticmethod
    def _grant_admin_permissions(role):
        keys = (
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
        for key in keys:
            permission = Permission.objects.get_or_create(key=key)[0]
            RolePermission.objects.get_or_create(role=role, permission=permission)

    @staticmethod
    def _grant_club_permissions(role):
        keys = (
            "booking.view_own",
            "booking.create",
            "booking.edit_own_before_approval",
            "booking.cancel_own",
            "export.mau_a",
        )
        for key in keys:
            permission = Permission.objects.get_or_create(key=key)[0]
            RolePermission.objects.get_or_create(role=role, permission=permission)

    @staticmethod
    def _organization(name, abbreviation, representative, hotline, email):
        return Organization.objects.update_or_create(
            abbreviation=abbreviation,
            defaults={
                "name": name,
                "type": "club",
                "representative_name": representative,
                "hotline": hotline,
                "contact_email": email,
                "active": True,
            },
        )[0]

    @staticmethod
    def _user(
        username,
        email,
        password,
        role,
        organization,
        *,
        is_staff=False,
        is_superuser=False,
    ):
        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(username=username)
        user.email = email
        user.is_active = True
        user.is_staff = is_staff
        user.is_superuser = is_superuser
        user.set_password(password)
        user.save()
        UserProfile.objects.update_or_create(
            user=user,
            defaults={
                "role": role,
                "organization": organization,
                "must_change_password": False,
            },
        )
        return user

    @staticmethod
    def _room(building, name, floor, capacity, **features):
        defaults = {
            "floor": floor,
            "capacity": capacity,
            "type": "meeting",
            "rentable": True,
            "active": True,
            **features,
        }
        return Room.objects.update_or_create(
            building=building,
            name=name,
            defaults=defaults,
        )[0]

    @staticmethod
    def _booking(
        activity_name,
        organization,
        room,
        user,
        start_time,
        end_time,
        status,
        physical_status,
    ):
        now = timezone.now()
        physical_submitted_at = now if physical_status != PhysicalStatus.NOT_SUBMITTED else None
        physical_confirmed_at = (
            now if physical_status == PhysicalStatus.CONFIRMED_RECEIVED else None
        )
        booking, _ = Booking.objects.get_or_create(
            activity_name=activity_name,
            organization=organization,
            defaults={
                "room": room,
                "description": "Dữ liệu booking mẫu để kiểm tra giao diện và quy trình.",
                "participant_count": min(30, room.capacity),
                "contact_person": organization.representative_name,
                "contact_phone": organization.hotline,
                "contact_email": organization.contact_email,
                "start_time": start_time,
                "end_time": end_time,
                "status": status,
                "physical_status": physical_status,
                "physical_submitted_at": physical_submitted_at,
                "physical_confirmed_at": physical_confirmed_at,
                "hold_expires_at": (
                    now + timedelta(hours=48)
                    if status == BookingStatus.PENDING_HOLD
                    else None
                ),
                "created_by": user,
            },
        )
        return booking
