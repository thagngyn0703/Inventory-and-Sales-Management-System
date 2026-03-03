import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../AdminHome/AdminDashBoard.css";
import "./ProductPages.css";
import { createProductApi } from "../../utils/productsApi";

export default function ProductCreatePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    category_id: "",
    name: "",
    sku: "",
    barcode: "",
    cost_price: "",
    sale_price: "",
    stock_qty: "",
    reorder_level: "",
    status: "active",
  });

  const onChange = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false;
    if (!form.sku.trim() && !form.barcode.trim()) return false;
    const sale = Number(form.sale_price || 0);
    const cost = Number(form.cost_price || 0);
    if (!Number.isFinite(sale) || sale < 0) return false;
    if (!Number.isFinite(cost) || cost < 0) return false;
    return true;
  }, [form]);

  const validate = () => {
    if (!form.name.trim()) return "Vui lòng nhập tên sản phẩm.";
    if (!form.sku.trim() && !form.barcode.trim())
      return "Vui lòng nhập ít nhất SKU hoặc Barcode.";
    const sale = Number(form.sale_price || 0);
    const cost = Number(form.cost_price || 0);
    const stock = Number(form.stock_qty || 0);
    const min = Number(form.reorder_level || 0);
    if (!Number.isFinite(sale) || sale < 0) return "Giá bán không hợp lệ.";
    if (!Number.isFinite(cost) || cost < 0) return "Giá vốn không hợp lệ.";
    if (!Number.isFinite(stock) || stock < 0) return "Tồn kho không hợp lệ.";
    if (!Number.isFinite(min) || min < 0) return "Mức tồn tối thiểu không hợp lệ.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const msg = validate();
    if (msg) return setError(msg);

    setLoading(true);
    try {
      await createProductApi(form);
      navigate("/admin/products", { replace: true });
    } catch (err) {
      setError(err?.message || "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card admin-card--wide">
        <div className="pm-header">
          <div>
            <h1 className="pm-title">➕ Create product</h1>
            <p className="pm-subtitle">
              Tạo sản phẩm mới (lưu MongoDB qua API).
            </p>
          </div>

          <div className="pm-actions">
            <button className="pm-secondary" onClick={() => navigate("/admin/products")}>
              Back to list
            </button>
          </div>
        </div>

        <form className="pm-form" onSubmit={handleSubmit}>
          <div className="pm-grid">
            <div className="pm-field">
              <label className="pm-label">Name *</label>
              <input
                className="pm-input"
                value={form.name}
                onChange={onChange("name")}
                placeholder="Ví dụ: Coca Cola 330ml"
              />
            </div>

            <div className="pm-field">
              <label className="pm-label">Category ID</label>
              <input
                className="pm-input"
                value={form.category_id}
                onChange={onChange("category_id")}
                placeholder="ObjectId hoặc mã category (demo)"
              />
            </div>

            <div className="pm-field">
              <label className="pm-label">SKU *</label>
              <input
                className="pm-input"
                value={form.sku}
                onChange={onChange("sku")}
                placeholder="Ví dụ: COKE330"
              />
            </div>

            <div className="pm-field">
              <label className="pm-label">Barcode *</label>
              <input
                className="pm-input"
                value={form.barcode}
                onChange={onChange("barcode")}
                placeholder="Ví dụ: 893xxxxxx"
              />
            </div>

            <div className="pm-field">
              <label className="pm-label">Cost price</label>
              <input
                className="pm-input"
                value={form.cost_price}
                onChange={onChange("cost_price")}
                placeholder="0"
                inputMode="numeric"
              />
            </div>

            <div className="pm-field">
              <label className="pm-label">Sale price</label>
              <input
                className="pm-input"
                value={form.sale_price}
                onChange={onChange("sale_price")}
                placeholder="0"
                inputMode="numeric"
              />
            </div>

            <div className="pm-field">
              <label className="pm-label">Stock qty</label>
              <input
                className="pm-input"
                value={form.stock_qty}
                onChange={onChange("stock_qty")}
                placeholder="0"
                inputMode="numeric"
              />
            </div>

            <div className="pm-field">
              <label className="pm-label">Reorder level</label>
              <input
                className="pm-input"
                value={form.reorder_level}
                onChange={onChange("reorder_level")}
                placeholder="0"
                inputMode="numeric"
              />
            </div>

            <div className="pm-field">
              <label className="pm-label">Status</label>
              <select className="pm-select" value={form.status} onChange={onChange("status")}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
          </div>

          {error && <div className="pm-error">{error}</div>}

          <div className="pm-actions" style={{ justifyContent: "flex-end" }}>
            <button
              type="submit"
              className="pm-primary"
              disabled={!canSubmit || loading}
              style={{ opacity: !canSubmit || loading ? 0.6 : 1 }}
            >
              {loading ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

