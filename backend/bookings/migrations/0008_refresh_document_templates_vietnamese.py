from django.db import migrations


DEFAULT_TEMPLATE_CONTENT = {
    "mau_a": {
        "leftHeader": "ĐOÀN ĐẠI HỌC QUỐC GIA HÀ NỘI\nBCH TRƯỜNG ĐẠI HỌC CÔNG NGHỆ\n***",
        "rightHeader": "ĐOÀN TNCS HỒ CHÍ MINH",
        "title": "ĐƠN ĐỀ NGHỊ",
        "recipient": "Kính gửi: Phòng Hành chính Quản trị và Tổ chức Cán bộ",
        "intro": (
            "Thực hiện nhiệm vụ kế hoạch năm học, đơn vị đăng ký mượn phòng "
            "để tổ chức hoạt động theo danh sách bên dưới."
        ),
        "commitment": (
            "Đơn vị cam kết sử dụng phòng đúng mục đích, giữ gìn cơ sở vật chất "
            "và hoàn trả nguyên trạng sau khi sử dụng."
        ),
        "closing": "Kính mong Quý Phòng xem xét và hỗ trợ. Xin trân trọng cảm ơn!",
        "leftSignature": "Ý KIẾN\nPHÒNG HCQT & TCCB",
        "rightSignature": "TM. BCH ĐOÀN TRƯỜNG\nUV BAN THƯỜNG VỤ",
    },
    "mau_b": {
        "leftHeader": "ĐOÀN ĐẠI HỌC QUỐC GIA HÀ NỘI\nBCH TRƯỜNG ĐẠI HỌC CÔNG NGHỆ\n***",
        "rightHeader": "ĐOÀN TNCS HỒ CHÍ MINH",
        "title": "ĐƠN ĐỀ NGHỊ",
        "recipient": "Kính gửi: Phòng Hành chính Quản trị và Tổ chức Cán bộ",
        "intro": (
            "Văn phòng Đoàn tổng hợp các lịch mượn phòng đã được duyệt "
            "trong khoảng thời gian dưới đây."
        ),
        "commitment": (
            "Các đơn vị trực thuộc ĐTN - HSV cam kết hoàn trả nguyên trạng "
            "cơ sở vật chất sau khi sử dụng."
        ),
        "closing": "Kính mong Quý Phòng xem xét và hỗ trợ. Xin trân trọng cảm ơn!",
        "leftSignature": "Ý KIẾN\nPHÒNG HCQT & TCCB",
        "rightSignature": "TM. BCH ĐOÀN TRƯỜNG\nUV BAN THƯỜNG VỤ",
    },
}


def refresh_templates(apps, schema_editor):
    document_template = apps.get_model("bookings", "DocumentTemplate")
    for template_type, content in DEFAULT_TEMPLATE_CONTENT.items():
        document_template.objects.update_or_create(
            template_type=template_type,
            defaults={
                "name": "Mẫu A" if template_type == "mau_a" else "Mẫu B",
                "content": content,
                "active": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0007_seed_permission_keys"),
    ]

    operations = [
        migrations.RunPython(refresh_templates, migrations.RunPython.noop),
    ]
