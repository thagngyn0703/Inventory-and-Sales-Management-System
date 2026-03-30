# Mô hình phân quyền 3 Role

Hệ thống chỉ sử dụng **3 role**:

| Role | Mô tả |
|---|---|
| `admin` | Quản trị nền tảng (quản lý store, user, RBAC) |
| `manager` | Chủ cửa hàng — full quyền trong store của mình |
| `staff` | Nhân viên — vận hành hằng ngày (POS + nhập kho + kiểm kho) |

> Role cũ `warehouse_staff`, `sales_staff`, `warehouse`, `sales` đã được **backward-compat map về `staff`** trong cả BE middleware và FE util, nhưng không nên tạo mới.

---

## Migrate user cũ (nếu có role cũ trong DB)

Chạy lệnh sau trong **MongoDB Shell (mongosh)** hoặc Compass để chuẩn hóa:

```javascript
// Đổi tất cả role cũ về 'staff'
db.users.updateMany(
  { role: { $in: ["warehouse_staff", "sales_staff", "warehouse", "sales"] } },
  { $set: { role: "staff" } }
)
```

```javascript
// Đổi 1 user cụ thể thành manager
db.users.updateOne(
  { email: "owner@example.com" },
  { $set: { role: "manager" } }
)
```

```javascript
// Đổi 1 user cụ thể thành staff
db.users.updateOne(
  { email: "staff@example.com" },
  { $set: { role: "staff" } }
)
```

Sau khi cập nhật, user đăng nhập lại sẽ có role mới và vào đúng dashboard.
