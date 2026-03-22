import './App.css';
import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from './pages/AuthPage/AuthPage';
import Home from "./pages/HomePageUser/Home";
import AdminDashboard from "./pages/AdminHome/AdminDashBoard";
import AdminUserList from "./pages/AdminHome/AdminUserList";
import ManagerDashboard from "./pages/ManagerDashboard/ManagerDashboard.jsx";
import ManagerProductList from "./pages/ManagerDashboard/ManagerProductList.jsx";
import ManagerProductDetail from "./pages/ManagerDashboard/ManagerProductDetail.jsx";
import ManagerProductCreate from "./pages/ManagerDashboard/ManagerProductCreate.jsx";
import ManagerProductEdit from "./pages/ManagerDashboard/ManagerProductEdit.jsx";
import ManagerProductRequests from "./pages/ManagerDashboard/ManagerProductRequests.jsx";
import RequireRole from "./components/RequireRole";
import ManagerStocktakePending from "./pages/ManagerDashboard/ManagerStocktakePending.jsx";
import ManagerAdjustmentList from "./pages/ManagerDashboard/ManagerAdjustmentList.jsx";
import ManagerAdjustmentDetail from "./pages/ManagerDashboard/ManagerAdjustmentDetail.jsx";
import ManagerReceiptList from "./pages/ManagerDashboard/ManagerReceiptList.jsx";
import ManagerReceiptDetail from "./pages/ManagerDashboard/ManagerReceiptDetail.jsx";
import WarehouseDashboard from "./pages/WarehouseDashboard/WarehouseDashboard.jsx";
import WarehouseHome from "./pages/WarehouseDashboard/WarehouseHome.jsx";
import WarehouseStocktakingCreate from "./pages/WarehouseDashboard/WarehouseStocktakingCreate.jsx";
import WarehouseStocktakingList from "./pages/WarehouseDashboard/WarehouseStocktakingList.jsx";
import WarehouseStocktakingDetail from "./pages/WarehouseDashboard/WarehouseStocktakingDetail.jsx";
import WarehouseGoodsReceiptList from "./pages/WarehouseDashboard/WarehouseGoodsReceiptList.jsx";
import WarehouseGoodsReceiptCreate from "./pages/WarehouseDashboard/WarehouseGoodsReceiptCreate.jsx";
import WarehouseGoodsReceiptDetail from "./pages/WarehouseDashboard/WarehouseGoodsReceiptDetail.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/home" element={<Home />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/users" element={<AdminUserList />} />
      <Route path="/manager" element={<ManagerDashboard />} />
      <Route path="/manager/products" element={<ManagerProductList />} />
      <Route path="/manager/products/new" element={<ManagerProductCreate />} />
      <Route path="/manager/product-requests" element={<ManagerProductRequests />} />
      <Route path="/manager/products/:id/edit" element={<ManagerProductEdit />} />
      <Route path="/manager/products/:id" element={<ManagerProductDetail />} />
      <Route path="/manager/stocktakes" element={<ManagerStocktakePending />} />
      <Route path="/manager/adjustments" element={<ManagerAdjustmentList />} />
      <Route path="/manager/adjustments/:id" element={<ManagerAdjustmentDetail />} />
      <Route path="/manager/receipts" element={<ManagerReceiptList />} />
      <Route path="/manager/receipts/:id" element={<ManagerReceiptDetail />} />
      <Route
        path="/warehouse"
        element={
          <RequireRole allowedRoles={['warehouse', 'manager', 'admin']}>
            <WarehouseDashboard />
          </RequireRole>
        }
      >
        <Route index element={<WarehouseHome />} />
        <Route path="stocktakes" element={<WarehouseStocktakingList />} />
        <Route path="stocktakes/new" element={<WarehouseStocktakingCreate />} />
        <Route path="stocktakes/:id" element={<WarehouseStocktakingDetail />} />
        <Route path="receipts" element={<WarehouseGoodsReceiptList />} />
        <Route path="receipts/new" element={<WarehouseGoodsReceiptCreate />} />
        <Route path="receipts/:id" element={<WarehouseGoodsReceiptDetail />} />
      </Route>
    </Routes>
  );
}

export default App;
