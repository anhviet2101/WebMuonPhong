from django.urls import include, path
from rest_framework.routers import DefaultRouter

from backend.bookings.views import (
    BookingViewSet,
    BuildingViewSet,
    CampusViewSet,
    AuditLogViewSet,
    BusinessRuleConfigViewSet,
    BorrowingPolicyViewSet,
    DocumentTemplateViewSet,
    NotificationViewSet,
    OrganizationViewSet,
    RoomBlackoutViewSet,
    RoomViewSet,
    AccountTokenObtainPairView,
    TokenRefreshView,
    ChangePasswordView,
    OrganizationProfileView,
    UserProfileView,
    AdminUserListView,
    AdminUserDetailView,
)


router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")
router.register("campuses", CampusViewSet, basename="campus")
router.register("buildings", BuildingViewSet, basename="building")
router.register("rooms", RoomViewSet, basename="room")
router.register("bookings", BookingViewSet, basename="booking")
router.register("blackouts", RoomBlackoutViewSet, basename="blackout")
router.register("rule-configs", BusinessRuleConfigViewSet, basename="rule-config")
router.register("borrowing-policies", BorrowingPolicyViewSet, basename="borrowing-policy")
router.register("document-templates", DocumentTemplateViewSet, basename="document-template")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("auth/login", AccountTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/refresh", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/change-password", ChangePasswordView.as_view(), name="change-password"),
    path("profile", UserProfileView.as_view(), name="profile"),
    path("auth/profile", UserProfileView.as_view(), name="auth-profile"),
    path("auth/me", UserProfileView.as_view(), name="auth-me"),
    path("organization", OrganizationProfileView.as_view(), name="organization-profile"),
    path(
        "organization/profile",
        OrganizationProfileView.as_view(),
        name="organization-profile-explicit",
    ),
    path("auth/organization", OrganizationProfileView.as_view(), name="auth-organization"),
    path("users", AdminUserListView.as_view(), name="admin-user-list"),
    path("users/<int:pk>", AdminUserDetailView.as_view(), name="admin-user-detail"),
    path("users/<int:pk>/restore", AdminUserDetailView.as_view(), name="admin-user-restore"),
    path(
        "users/<int:pk>/reset-password",
        AdminUserDetailView.as_view(),
        name="admin-user-reset-password",
    ),
    path("admin/users", AdminUserListView.as_view(), name="admin-users"),
    path("admin/users/<int:pk>", AdminUserDetailView.as_view(), name="admin-user"),
    path(
        "admin/users/<int:pk>/reset-password",
        AdminUserDetailView.as_view(),
        name="admin-user-reset-password-alias",
    ),
    path("", include(router.urls)),
]
