import './App.css';
import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from './pages/AuthPage/AuthPage';
import Home from "./pages/HomePageUser/Home";
import AdminDashboard from "./pages/AdminHome/AdminDashBoard";
import ManagerDashboard from "./pages/ManagerDashboard/ManagerDashboard";
import ManagerProductList from "./pages/ManagerDashboard/ManagerProductList";
import ManagerProductCreate from "./pages/ManagerDashboard/ManagerProductCreate";
import ManagerProductDetail from "./pages/ManagerDashboard/ManagerProductDetail";
import ManagerProductEdit from "./pages/ManagerDashboard/ManagerProductEdit";
import RequireRole from "./components/RequireRole";
import WarehouseDashboard from "./pages/WarehouseDashboard/WarehouseDashboard";
import WarehouseHome from "./pages/WarehouseDashboard/WarehouseHome";
import WarehouseStocktakingCreate from "./pages/WarehouseDashboard/WarehouseStocktakingCreate";
import WarehouseStocktakingList from "./pages/WarehouseDashboard/WarehouseStocktakingList";
import WarehouseStocktakingDetail from "./pages/WarehouseDashboard/WarehouseStocktakingDetail";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/home" element={<Home />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/manager" element={<ManagerDashboard />} />
      <Route path="/manager/products" element={<ManagerProductList />} />
      <Route path="/manager/products/new" element={<ManagerProductCreate />} />
      <Route path="/manager/products/:id/edit" element={<ManagerProductEdit />} />
      <Route path="/manager/products/:id" element={<ManagerProductDetail />} />
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
      </Route>
    </Routes>
  );
}

export default App;
