import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../AdminHome/AdminDashBoard.css";
import "./ProductPages.css";
import { getCurrentUser, normalizeRole } from "../../utils/auth";
import { fetchProducts } from "../../utils/productsApi";

export default function ProductListPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const user = getCurrentUser();
  const role = normalizeRole(user?.role);
  const canCreate = true;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const requestSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError("");

    fetchProducts({ q })
      .then((list) => {
        if (!alive) return;
        if (seq !== requestSeq.current) return;
        setProducts(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        if (!alive) return;
        if (seq !== requestSeq.current) return;
        setError(e?.message || "Fetch failed");
        setProducts([]);
      })
      .finally(() => {
        if (!alive) return;
        if (seq !== requestSeq.current) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [q]);

  const filtered = useMemo(() => products, [products]);

  const fmtMoney = (n) => {
    const v = Number(n || 0);
    return v.toLocaleString("vi-VN");
  };

  return (
    <div className="admin-page">
      <div className="admin-card admin-card--wide">
        <div className="pm-header">
          <div>
            <h1 className="pm-title">📦 Product Management</h1>
            <p className="pm-subtitle">
              View product list, search nhanh theo tên/SKU/barcode, và tạo sản phẩm mới.
            </p>
          </div>

          <div className="pm-actions">
            <input
              className="pm-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search: name / sku / barcode / status..."
            />
            {canCreate && (
              <button className="pm-primary" onClick={() => navigate("/admin/products/new")}>
                + Create product
              </button>
            )}
            <button className="pm-secondary" onClick={() => navigate("/admin")}>
              Back
            </button>
          </div>
        </div>

        {error && <div className="pm-error" style={{ marginTop: 10 }}>{error}</div>}

        <table className="pm-table">
          <thead>
            <tr>
              <th style={{ width: 190 }}>SKU / Barcode</th>
              <th>Name</th>
              <th style={{ width: 140 }}>Category</th>
              <th style={{ width: 110 }}>Stock</th>
              <th style={{ width: 140 }}>Sale price</th>
              <th style={{ width: 110 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 14, color: "#6b7280" }}>
                  Đang tải danh sách sản phẩm...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 14, color: "#6b7280" }}>
                  Chưa có sản phẩm nào.{canCreate ? (
                    <>
                      {" "}Bấm <b>Create product</b> để tạo sản phẩm đầu tiên.
                    </>
                  ) : (
                    <> (Bạn không có quyền tạo sản phẩm.)</>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p._id}>
                  <td>
                    <div style={{ fontWeight: 800 }}>{p.sku || "-"}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>{p.barcode || "-"}</div>
                  </td>
                  <td style={{ fontWeight: 800 }}>{p.name}</td>
                  <td style={{ color: "#6b7280" }}>{p.category_id || "-"}</td>
                  <td>
                    <span style={{ fontWeight: 800 }}>{Number(p.stock_qty || 0)}</span>
                    <span style={{ color: "#6b7280" }}>
                      {" "}
                      (min {Number(p.reorder_level || 0)})
                    </span>
                  </td>
                  <td style={{ fontWeight: 800 }}>{fmtMoney(p.sale_price)} đ</td>
                  <td>
                    <span
                      className={[
                        "pm-badge",
                        p.status === "inactive" ? "pm-badge--inactive" : "pm-badge--active",
                      ].join(" ")}
                    >
                      {p.status || "active"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

