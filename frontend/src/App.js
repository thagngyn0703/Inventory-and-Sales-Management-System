import './App.css';
import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from './pages/AuthPage/AuthPage';
import Home from "./pages/HomePageUser/Home";
import AdminDashboard from "./pages/AdminHome/AdminDashBoard";
import ManagerDashboard from "./pages/ManagerDashboard/ManagerDashboard";
import ManagerProductList from "./pages/ManagerDashboard/ManagerProductList";
import ManagerProductCreate from "./pages/ManagerDashboard/ManagerProductCreate";
// new imports for categories and auth guards
import Categories from "./pages/Categories/Categories";
import RequireAuth from "./components/RequireAuth";
import ManagerProductDetail from "./pages/ManagerDashboard/ManagerProductDetail";
import ManagerProductEdit from "./pages/ManagerDashboard/ManagerProductEdit";
import ManagerInvoicesList from "./pages/ManagerDashboard/ManagerInvoicesList";
import ManagerInvoiceDetail from "./pages/ManagerDashboard/ManagerInvoiceDetail";
import RequireRole from "./components/RequireRole";
import WarehouseDashboard from "./pages/WarehouseDashboard/WarehouseDashboard.jsx";
import WarehouseHome from "./pages/WarehouseDashboard/WarehouseHome.jsx";
import WarehouseStocktakingCreate from "./pages/WarehouseDashboard/WarehouseStocktakingCreate.jsx";
import WarehouseStocktakingList from "./pages/WarehouseDashboard/WarehouseStocktakingList.jsx";
import WarehouseStocktakingDetail from "./pages/WarehouseDashboard/WarehouseStocktakingDetail.jsx";
import WarehouseInvoicesList from "./pages/WarehouseDashboard/WarehouseInvoicesList.jsx";
import WarehouseInvoiceDetail from "./pages/WarehouseDashboard/WarehouseInvoiceDetail.jsx";
import ManagerStocktakePending from "./pages/ManagerDashboard/ManagerStocktakePending";
import ManagerAdjustmentList from "./pages/ManagerDashboard/ManagerAdjustmentList";
import ManagerAdjustmentDetail from "./pages/ManagerDashboard/ManagerAdjustmentDetail";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/home" element={<Home />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/manager" element={<ManagerDashboard />} />
      <Route path="/manager/products" element={<ManagerProductList />} />
      <Route
        path="/manager/categories"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={["manager", "warehouse_staff"]}>
              <Categories />
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="/manager/products/new" element={<ManagerProductCreate />} />
      <Route path="/manager/products/:id/edit" element={<ManagerProductEdit />} />
      <Route path="/manager/products/:id" element={<ManagerProductDetail />} />
      <Route path="/manager/invoices" element={<ManagerInvoicesList />} />
      <Route path="/manager/invoices/new" element={<ManagerInvoiceDetail />} />
      <Route path="/manager/invoices/:id" element={<ManagerInvoiceDetail />} />
      <Route path="/manager/stocktakes/pending" element={<ManagerStocktakePending />} />
      <Route path="/manager/adjustments" element={<ManagerAdjustmentList />} />
      <Route path="/manager/adjustments/:id" element={<ManagerAdjustmentDetail />} />
      <Route
        path="/warehouse"
        element={
          <RequireRole allowedRoles={['warehouse', 'sales', 'manager', 'admin']}>
            <WarehouseDashboard />
          </RequireRole>
        }
      >
        <Route index element={<WarehouseHome />} />
        <Route path="stocktakes" element={<WarehouseStocktakingList />} />
        <Route path="stocktakes/new" element={<WarehouseStocktakingCreate />} />
        <Route path="stocktakes/:id" element={<WarehouseStocktakingDetail />} />
        <Route path="invoices" element={<WarehouseInvoicesList />} />
        <Route path="invoices/new" element={<WarehouseInvoiceDetail />} />
        <Route path="invoices/:id" element={<WarehouseInvoiceDetail />} />
      </Route>
    </Routes>
  );
}

export default App;
