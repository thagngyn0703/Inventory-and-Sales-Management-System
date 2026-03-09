# Cập nhật role user trong MongoDB

**Lưu ý:** Khi bạn sửa enum `role` trong model `User.js`, MongoDB **không tự động** cập nhật các document đã có. Các user cũ vẫn giữ nguyên giá trị `role` hiện tại (ví dụ `user` hoặc `admin`).

Để tài khoản đăng nhập vào Manager Dashboard và dùng được Sản phẩm (xem danh sách, thêm sản phẩm), bạn cần **đổi role** của user đó sang `manager` (hoặc `warehouse` / `sales` tùy quyền).

## Cách 1: MongoDB Compass (giao diện)

1. Mở MongoDB Compass, kết nối tới database (cùng `MONGO_URI` trong `.env`).
2. Chọn database → collection `users`.
3. Tìm document user cần đổi (theo `email` hoặc `fullName`).
4. Bấm **Edit** (hoặc double-click document), sửa field `role` từ `user` thành `manager` (hoặc `warehouse`, `sales`).
5. Save.

## Cách 2: MongoDB Shell (mongosh)

Kết nối shell tới MongoDB (hoặc dùng "MongoSH" trong Compass), chạy:

**Đổi 1 user theo email (ví dụ đổi thành manager):**
```javascript
db.users.updateOne(
  { email: "email_cua_ban@example.com" },
  { $set: { role: "manager" } }
)
```

**Đổi tất cả user hiện có thành manager (cẩn thận, chỉ dùng khi cần):**
```javascript
db.users.updateMany(
  {},
  { $set: { role: "manager" } }
)
```

**Chỉ đổi những user đang là `user` thành `manager`:**
```javascript
db.users.updateMany(
  { role: "user" },
  { $set: { role: "manager" } }
)
```

Sau khi cập nhật, user đăng nhập lại sẽ có role mới và vào được `/manager` cùng trang Sản phẩm.
