# Triển khai: Cloudflare Pages + Oracle Cloud Always Free

Giao diện React chạy tại `https://<ten-du-an>.pages.dev`. Cloudflare Pages Function nhận `/api/*` và chuyển tiếp đến Django trên một máy Oracle Cloud. PostgreSQL, Redis và Celery chạy trên máy Oracle. Trình duyệt chỉ gọi `/api` cùng nguồn với giao diện, nên không cần cấu hình CORS cho `pages.dev`.

## Điều kiện cần

1. Tài khoản Cloudflare, GitHub có quyền truy cập kho mã, và Oracle Cloud Free Tier. Đăng ký Oracle Cloud có thể cần thẻ thanh toán để xác minh; chỉ chọn tài nguyên gắn nhãn **Always Free Eligible** trong **home region**. Khả năng tạo máy phụ thuộc dung lượng còn trống của region.
2. Tên DNS công khai trỏ tới IP của máy Oracle để Caddy tự cấp HTTPS. Nếu chưa mua tên miền, có thể đăng ký một tên phụ miễn phí như `<ten-ban>.duckdns.org` rồi trỏ A record đến IP Oracle. Tên `*.pages.dev` đã được Cloudflare cấp cho giao diện, nên không cần mua tên miền cho phần này. Tên DNS miễn phí là dịch vụ bên thứ ba; nếu ngừng hoạt động, cần đổi `API_DOMAIN` và `API_ORIGIN`.
3. Ubuntu 24.04 LTS trên VM.Standard.A1.Flex Arm, tối đa trong phần định mức Always Free hiện hành. Ví dụ một máy 2 OCPU/12 GB RAM, boot volume 50 GB. Mở TCP 80/443 trong OCI VCN security list hoặc NSG và tường lửa trên VM; chỉ mở SSH 22 cho IP quản trị. Không mở 5432, 6379 hay 8000 ra Internet.

Cloudflare Pages phục vụ tệp tĩnh miễn phí không giới hạn lượt yêu cầu theo tài liệu hiện tại; mỗi lượt gọi `/api/*` tính vào định mức Workers Free chung **100.000 yêu cầu/ngày**. Khi vượt định mức, API có thể ngừng đáp ứng cho đến kỳ đặt lại. Xem [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/).

Tham khảo: [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Cloudflare Pages React](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/), [DuckDNS](https://www.duckdns.org/spec.jsp).

## 1. Chuẩn bị máy Oracle

Tạo VM Ubuntu Always Free và gán public IPv4. Nên dùng **reserved public IP** để DNS không đổi nếu thay máy. Ghi lại IP và thêm bản ghi A của tên DNS API trỏ đến IP đó. Đợi DNS phân giải đúng trước khi chạy Caddy.

SSH vào máy, cài Git và Docker Engine cùng Compose plugin theo [hướng dẫn chính thức cho Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Hướng dẫn đó hỗ trợ `arm64`; dùng phương án cài từ kho `apt` chính thức, rồi kiểm tra `sudo docker compose version`.

```bash
sudo apt update
sudo apt install -y git
git clone https://github.com/anhviet2101/WebMuonPhong.git app-muon-phong
cd app-muon-phong
```

Kho GitHub phải chứa phiên bản mã đã được kiểm thử. Nếu kho ở chế độ riêng tư, cấu hình quyền đọc GitHub trên VM trước khi clone. Không đưa `.env.production`, `.env`, mật khẩu hay khóa SSH vào Git.

## 2. Cấu hình backend

```bash
cp deploy/oci/.env.production.example deploy/oci/.env.production
chmod 600 deploy/oci/.env.production
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
```

Sửa `deploy/oci/.env.production`:

- `API_DOMAIN`: tên DNS API, **không có** `https://`, ví dụ `phong-clb.duckdns.org`.
- `DJANGO_SECRET_KEY`: chuỗi ngẫu nhiên vừa tạo.
- `POSTGRES_PASSWORD`: mật khẩu ngẫu nhiên khác với Django secret.
- Các biến SMTP là tùy chọn. Khi để `EMAIL_BACKEND` mặc định, ứng dụng vẫn có thông báo trong hệ thống nhưng email chỉ ghi vào log.

Chạy từ thư mục gốc của kho mã:

```bash
sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml config --quiet
sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml build api
sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml up -d db redis
sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml run --rm api python manage.py migrate
sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml up -d
sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml ps
```

Nếu cần tài khoản quản trị đầu tiên:

```bash
sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml run --rm api python manage.py createsuperuser
```

Kiểm tra `https://<API_DOMAIN>/health/` trả `{"status":"ok"}` và chứng chỉ HTTPS hợp lệ. Nếu Caddy chưa cấp chứng chỉ, kiểm tra DNS, cổng 80/443 và `sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml logs caddy`.

## 3. Triển khai Cloudflare Pages

Trong Cloudflare Dashboard, vào **Workers & Pages → Create application → Pages → Import an existing Git repository**. Kết nối kho `anhviet2101/WebMuonPhong` và đặt:

- Production branch: `main`
- Root directory: `/` (gốc kho)
- Build command: `npm run build`
- Build output directory: `dist`
- Build image: v3; phiên bản Node được cố định trong `.node-version`.

Sau khi tạo dự án, vào **Settings → Variables and Secrets**. Thêm biến thường `API_ORIGIN=https://<API_DOMAIN>` cho Production và Preview. Không đặt `VITE_API_URL` thành một URL ngoài; giá trị mặc định `/api` sẽ đi qua Pages Function. Triển khai lại sau khi thêm biến. Cloudflare sẽ cấp URL `https://<ten-du-an>.pages.dev`.

Kiểm tra `https://<ten-du-an>.pages.dev/api/...` qua giao diện bằng đăng nhập và thao tác đọc danh sách phòng. `/api/*` chạy Pages Function; các tệp tĩnh không gọi Function nhờ `_routes.json`. Nếu `API_ORIGIN` thiếu hoặc không phải HTTPS, Function trả 503 để báo cấu hình thiếu.

Tham khảo: [Pages Git integration](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/), [Pages Function variables](https://developers.cloudflare.com/pages/functions/bindings/), [Function routing](https://developers.cloudflare.com/pages/functions/routing/).

## Cập nhật và sao lưu

Mỗi lần cập nhật backend: lấy commit đã kiểm thử, chạy `build api`, chạy `migrate`, rồi `up -d`. Cloudflare Pages tự xây dựng lại giao diện khi branch `main` nhận commit mới.

Trước mỗi lần cập nhật có migration, sao lưu **cả PostgreSQL lẫn media**. Ví dụ tại thư mục gốc trên VM:

```bash
mkdir -p backups
sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/db-$(date +%F).sql"
sudo docker compose --env-file deploy/oci/.env.production -f deploy/oci/compose.yaml cp api:/app/media "backups/media-$(date +%F)"
```

Chuyển bản sao lưu ra nơi khác và thử khôi phục định kỳ; bản sao nằm trên cùng VM không bảo vệ được khi mất VM. Có thể dùng phần định mức [OCI Always Free Object Storage/volume backup](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), nhưng cần kiểm tra giới hạn tài khoản trước khi bật sao lưu tự động. Không chạy `docker compose down --volumes` trên hệ thống thật vì lệnh đó xóa dữ liệu trong volumes.
