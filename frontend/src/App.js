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
import ManagerInvoiceView from "./pages/ManagerDashboard/ManagerInvoiceView";
import RequireRole from "./components/RequireRole";
import WarehouseDashboard from "./pages/WarehouseDashboard/WarehouseDashboard.jsx";
import WarehouseHome from "./pages/WarehouseDashboard/WarehouseHome.jsx";
import WarehouseStocktakingCreate from "./pages/WarehouseDashboard/WarehouseStocktakingCreate.jsx";
import WarehouseStocktakingList from "./pages/WarehouseDashboard/WarehouseStocktakingList.jsx";
import WarehouseStocktakingDetail from "./pages/WarehouseDashboard/WarehouseStocktakingDetail.jsx";
import SalesInvoicesList from "./pages/SaleDashboard/SalesInvoicesList.jsx";
import SalesInvoiceDetail from "./pages/SaleDashboard/SalesInvoiceDetail.jsx";
import SalesInvoiceView from "./pages/SaleDashboard/SalesInvoiceView.jsx";
import SalesDashboard from "./pages/SaleDashboard/SalesDashboard";
// SalesHome removed as per user request

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
      <Route path="/manager/invoices/:id" element={<ManagerInvoiceView />} />
      <Route path="/manager/invoices/:id/edit" element={<ManagerInvoiceDetail />} />
      <Route
        path="/warehouse"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={['warehouse', 'warehouse_staff', 'admin', 'manager']}>
              <WarehouseDashboard />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<WarehouseHome />} />
        <Route path="stocktakes" element={<WarehouseStocktakingList />} />
        <Route path="stocktakes/new" element={<WarehouseStocktakingDetail />} />
        <Route path="stocktakes/:id" element={<WarehouseStocktakingDetail />} />
      </Route>

      <Route
        path="/sales"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={['sales', 'sales_staff', 'admin', 'manager']}>
              <SalesDashboard />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="invoices/new" replace />} />
        <Route path="invoices" element={<SalesInvoicesList />} />
        <Route path="invoices/new" element={<SalesInvoiceDetail />} />
        <Route path="returns" element={<SalesInvoicesList />} />
        <Route path=":id" element={<SalesInvoiceView />} />
      </Route>
    </Routes>
  );
}

export default App;
