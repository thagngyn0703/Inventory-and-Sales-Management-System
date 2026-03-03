import './App.css';
import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from './pages/AuthPage/AuthPage';
import Home from "./pages/HomePageUser/Home";
import AdminDashboard from "./pages/AdminHome/AdminDashBoard";
import ProductListPage from "./pages/Product/ProductListPage";
import ProductCreatePage from "./pages/Product/ProductCreatePage";
import RequireAuth from "./components/RequireAuth";
import RequireRole from "./components/RequireRole";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/home"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminDashboard />
          </RequireAuth>
        }
      />

      {/* View product list + Search products */}
      <Route
        path="/admin/products"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={["user", "admin"]}>
              <ProductListPage />
            </RequireRole>
          </RequireAuth>
        }
      />

      {/* Create product */}
      <Route
        path="/admin/products/new"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={["user", "admin"]}>
              <ProductCreatePage />
            </RequireRole>
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default App;
