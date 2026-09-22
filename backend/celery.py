import os

from celery import Celery


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

app = Celery("app_muon_phong")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks(["backend.bookings"])
app.conf.imports = ("backend.bookings.tasks",)
