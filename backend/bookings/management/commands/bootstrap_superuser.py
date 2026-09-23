import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from backend.bookings.models import Role, UserProfile


class Command(BaseCommand):
    help = "Create the first application super admin from temporary environment variables."

    def handle(self, *args, **options):
        password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
        if not password:
            self.stdout.write("Bootstrap skipped: BOOTSTRAP_ADMIN_PASSWORD is not set.")
            return

        username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "").strip()
        email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip()
        if not username or not email:
            raise CommandError(
                "Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_EMAIL "
                "when BOOTSTRAP_ADMIN_PASSWORD is set."
            )

        user_model = get_user_model()
        existing_user = user_model.objects.filter(username=username).first()
        if existing_user:
            if not existing_user.is_active or not existing_user.is_superuser:
                raise CommandError("The bootstrap username belongs to another account.")
            profile = UserProfile.objects.select_related("role").filter(
                user=existing_user
            ).first()
            if profile and profile.role.name != "SUPER_ADMIN":
                raise CommandError("The existing account has a different application role.")
            if not profile:
                with transaction.atomic():
                    role, _ = Role.objects.get_or_create(name="SUPER_ADMIN")
                    UserProfile.objects.create(user=existing_user, role=role)
            self.stdout.write("Bootstrap skipped: super admin already exists.")
            return

        candidate = user_model(username=username, email=email)
        validate_password(password, user=candidate)
        with transaction.atomic():
            role, _ = Role.objects.get_or_create(name="SUPER_ADMIN")
            user = user_model.objects.create_superuser(
                username=username, email=email, password=password
            )
            UserProfile.objects.create(user=user, role=role)
        self.stdout.write("Initial super admin created.")
