# Inventory and Sales Management System (ISMS)

ISMS là hệ thống quản lý vận hành cửa hàng tập trung, giúp đồng bộ hoạt động bán hàng, kho, khách hàng, nhà cung cấp, công nợ, nhân sự và báo cáo trên cùng một nền tảng.

Hệ thống được xây dựng theo mô hình web full-stack, hỗ trợ nhiều cửa hàng và phân quyền theo vai trò **Admin**, **Manager** và **Staff**.

## Chức năng chính

- Quản lý sản phẩm, danh mục, đơn vị tính, giá bán và mã vạch.
- Bán hàng tại quầy (POS), lập hóa đơn, thanh toán và xử lý trả hàng.
- Quản lý nhập kho, kiểm kho, điều chỉnh tồn kho và lịch sử kho.
- Quản lý nhà cung cấp, công nợ, thanh toán và trả hàng nhà cung cấp.
- Quản lý khách hàng, công nợ khách hàng và chương trình tích điểm.
- Quản lý nhân viên, ca làm việc và quầy thu ngân.
- Theo dõi doanh thu, dòng tiền, thuế và các báo cáo vận hành.
- Thông báo thời gian thực bằng Socket.IO.
- Tích hợp thanh toán SePay, gửi email, Cloudinary và trợ lý AI.
- Quản trị cửa hàng, người dùng, phân quyền và gói dịch vụ.

## Công nghệ sử dụng

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React 19, React Router, Tailwind CSS, ApexCharts, Socket.IO Client |
| Backend | Node.js, Express, Socket.IO, JWT |
| Cơ sở dữ liệu | MongoDB, Mongoose |
| Kiểm thử | Jest, Supertest, React Testing Library |
| Triển khai | Docker, Nginx, GitHub Actions |
| Tích hợp | SePay, Cloudinary, SMTP, OpenAI/Gemini |

## Cấu trúc thư mục

```text
Inventory-and-Sales-Management-System/
├── backend/               # REST API, Socket.IO, models, services và tests
│   ├── middleware/        # Xác thực và phân quyền
│   ├── models/            # Các schema Mongoose
│   ├── routes/            # Các API endpoint
│   ├── services/          # Email, backup, thanh toán, thông báo...
│   ├── scripts/           # Script migration và tác vụ dữ liệu
│   └── __tests__/         # Kiểm thử backend
├── frontend/              # Ứng dụng React
│   ├── public/
│   └── src/
│       ├── components/    # Component dùng chung
│       ├── contexts/      # React Context
│       ├── pages/         # Giao diện theo từng vai trò
│       ├── services/      # Kết nối API
│       └── utils/         # Hàm tiện ích
├── deploy/                # Tài liệu triển khai
├── docs/                  # Tài liệu nghiệp vụ
└── docker-compose.yml     # Cấu hình chạy bằng Docker
```

## Yêu cầu môi trường

- [Node.js](https://nodejs.org/) 20 trở lên.
- Yarn 1.x.
- MongoDB hỗ trợ transaction: **Replica Set**, **Sharded Cluster** hoặc **MongoDB Atlas**.

> Backend kiểm tra khả năng hỗ trợ transaction khi khởi động. MongoDB standalone sẽ không đáp ứng yêu cầu này.

## Cài đặt và chạy ở môi trường phát triển

### 1. Tải mã nguồn

```bash
git clone <repository-url>
cd Inventory-and-Sales-Management-System
```

### 2. Cài đặt thư viện

```bash
yarn install
yarn --cwd backend install
yarn --cwd frontend install
```

### 3. Cấu hình biến môi trường

Sao chép file cấu hình mẫu:

```bash
cp backend/.env.example backend/.env
```

Trên Windows PowerShell có thể dùng:

```powershell
Copy-Item backend/.env.example backend/.env
```

Tối thiểu cần cập nhật các biến sau trong `backend/.env`:

```env
PORT=8000
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<database>
JWT_SECRET=<chuoi-bi-mat-dung-de-ky-token>
```

Các cấu hình như SMTP, SePay, Cloudinary, OpenAI/Gemini và dịch vụ gửi thông báo là tùy chọn theo tính năng. Danh sách đầy đủ và mô tả từng biến có trong [`backend/.env.example`](backend/.env.example).

Không commit file `.env` hoặc thông tin bí mật lên Git.

### 4. Khởi động ứng dụng

Chạy frontend và backend cùng lúc từ thư mục gốc:

```bash
yarn dev
```

Hoặc chạy riêng từng phần:

```bash
yarn start:backend
yarn start:frontend
```

Sau khi khởi động:

- Giao diện: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8000/api](http://localhost:8000/api)
- Kiểm tra trạng thái API: [http://localhost:8000/api/health](http://localhost:8000/api/health)

## Kiểm thử và build

Chạy kiểm thử backend:

```bash
yarn --cwd backend test
```

Chạy kiểm thử frontend:

```bash
yarn --cwd frontend test
```

Tạo bản build frontend cho production:

```bash
yarn --cwd frontend build
```

## Triển khai

Repository có sẵn `Dockerfile` cho frontend/backend, cấu hình Nginx và `docker-compose.yml`. Khi triển khai production:

1. Sao chép `.env.production.example` thành `.env.production`.
2. Thay toàn bộ giá trị mẫu bằng thông tin thật của môi trường.
3. Đảm bảo `MONGO_URI` trỏ tới MongoDB hỗ trợ transaction.
4. Thiết lập `CORS_ORIGIN` và `REACT_APP_API_URL` đúng với tên miền triển khai.

Tài liệu GitHub Actions nằm tại [`deploy/GITHUB_ACTIONS.md`](deploy/GITHUB_ACTIONS.md).

## Quy trình sử dụng cơ bản

1. Manager đăng ký tài khoản và hồ sơ cửa hàng.
2. Admin duyệt cửa hàng và quản lý quyền truy cập.
3. Manager cấu hình cửa hàng, tạo nhân viên, sản phẩm và nhà cung cấp.
4. Nhân viên thực hiện bán hàng, nhập kho, kiểm kho theo quyền được cấp.
5. Manager theo dõi doanh thu, tồn kho, công nợ và báo cáo.

## Đóng góp

Khi phát triển tính năng mới, nên tạo branch riêng và gửi Pull Request để các thành viên khác review trước khi merge.

```bash
git checkout -b feature/ten-tinh-nang
git add .
git commit -m "feat: mô tả ngắn gọn thay đổi"
git push origin feature/ten-tinh-nang
```

---

Đây là đồ án phát triển **Inventory and Sales Management System**, hướng tới việc hỗ trợ cửa hàng quản lý hoạt động hằng ngày hiệu quả, minh bạch và dễ mở rộng.
