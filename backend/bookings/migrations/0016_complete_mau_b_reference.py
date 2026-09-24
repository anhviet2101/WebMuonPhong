from django.db import migrations


OLD_COMMITMENT = (
    "Các đơn vị trực thuộc ĐTN – HSV cam kết sau khi sử dụng phòng học xong "
    "sẽ trả đúng nguyên trạng ban đầu của phòng học."
)
FULL_COMMITMENT = (
    OLD_COMMITMENT
    + " Ngoài ra, các đơn vị sử dụng phòng buổi tối sẽ tự chủ động mượn và hoàn trả lại thiết bị về đúng nơi quy định."
    + " Nếu xảy ra trường hợp hỏng hóc hay mất thiết bị, đơn vị sẽ hoàn toàn chịu trách nhiệm."
)


def complete_default(apps, schema_editor):
    template = apps.get_model("bookings", "DocumentTemplate").objects.filter(template_type="mau_b").first()
    if template is None:
        return
    content = dict(template.content or {})
    changed = False
    if content.get("commitment") in (None, OLD_COMMITMENT):
        content["commitment"] = FULL_COMMITMENT
        changed = True
    if "rightSignerName" not in content:
        content["rightSignerName"] = "Nguyễn Thị Hằng"
        changed = True
    if changed:
        template.content = content
        template.save(update_fields=["content"])


class Migration(migrations.Migration):
    dependencies = [("bookings", "0015_align_mau_b_with_reference")]
    operations = [migrations.RunPython(complete_default, migrations.RunPython.noop)]
