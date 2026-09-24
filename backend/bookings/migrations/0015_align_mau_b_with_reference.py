from django.db import migrations


OLD = {
    "intro": "Văn phòng Đoàn tổng hợp các lịch mượn phòng đã được duyệt trong khoảng thời gian dưới đây.",
    "commitment": "Các đơn vị trực thuộc ĐTN - HSV cam kết hoàn trả nguyên trạng cơ sở vật chất sau khi sử dụng.",
    "closing": "Kính mong Quý Phòng xem xét và hỗ trợ. Xin trân trọng cảm ơn!",
}
NEW = {
    "intro": "Thực hiện nhiệm vụ kế hoạch năm học, các đơn vị trực thuộc ĐTN – HSV tiến hành tổ chức sinh hoạt. Để hoạt động diễn ra đúng kế hoạch và thành công tốt đẹp, kính đề nghị Quý phòng xem xét và hỗ trợ. Cụ thể theo danh sách:",
    "commitment": "Các đơn vị trực thuộc ĐTN – HSV cam kết sau khi sử dụng phòng học xong sẽ trả đúng nguyên trạng ban đầu của phòng học.",
    "closing": "Kính mong nhận được sự giúp đỡ của Quý Phòng.\nXin trân trọng cảm ơn!",
}


def align_default(apps, schema_editor):
    template = apps.get_model("bookings", "DocumentTemplate").objects.filter(template_type="mau_b").first()
    if not template:
        return
    content = dict(template.content or {})
    changed = False
    for key, value in NEW.items():
        if content.get(key) in (None, OLD[key]):
            content[key] = value
            changed = True
    if changed:
        template.content = content
        template.save(update_fields=["content"])


class Migration(migrations.Migration):
    dependencies = [("bookings", "0014_remove_scan_simplify_physical_status")]
    operations = [migrations.RunPython(align_default, migrations.RunPython.noop)]
