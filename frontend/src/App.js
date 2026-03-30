import './App.css';
import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from './pages/AuthPage/AuthPage';
import NoStoreAssignedPage from "./pages/AuthPage/NoStoreAssignedPage";
import Home from "./pages/HomePageUser/Home";
import AdminDashboard from "./pages/AdminHome/AdminDashBoard";
import AdminStoresManage from "./pages/AdminHome/AdminStoresManage";
import AdminRbacManage from "./pages/AdminHome/AdminRbacManage";
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
import WarehouseGoodsReceiptList from "./pages/WarehouseDashboard/WarehouseGoodsReceiptList.jsx";
import WarehouseGoodsReceiptCreate from "./pages/WarehouseDashboard/WarehouseGoodsReceiptCreate.jsx";
import WarehouseGoodsReceiptDetail from "./pages/WarehouseDashboard/WarehouseGoodsReceiptDetail.jsx";
import SalesInvoicesList from "./pages/SaleDashboard/SalesInvoicesList.jsx";
import SalesInvoiceDetail from "./pages/SaleDashboard/SalesInvoiceDetail.jsx";
import SalesInvoiceView from "./pages/SaleDashboard/SalesInvoiceView.jsx";
import SalesReturnPage from "./pages/SaleDashboard/SalesReturnPage.jsx";
import SalesCustomerPage from "./pages/SaleDashboard/SalesCustomerPage.jsx";
import SalesDashboard from "./pages/SaleDashboard/SalesDashboard";
// SalesHome removed as per user request
import ManagerStocktakePending from "./pages/ManagerDashboard/ManagerStocktakePending";
import ManagerStocktakeDetail from "./pages/ManagerDashboard/ManagerStocktakeDetail";
import ManagerAdjustmentList from "./pages/ManagerDashboard/ManagerAdjustmentList";
import ManagerAdjustmentDetail from "./pages/ManagerDashboard/ManagerAdjustmentDetail";
import ManagerIncomingTransactionsBySupplier from "./pages/ManagerDashboard/ManagerIncomingTransactionsBySupplier";
import ManagerSupplierList from "./pages/ManagerDashboard/ManagerSupplierList";
import ManagerSupplierCreate from "./pages/ManagerDashboard/ManagerSupplierCreate";
import ManagerSupplierEdit from "./pages/ManagerDashboard/ManagerSupplierEdit";
import ManagerCreateStaff from "./pages/ManagerDashboard/ManagerCreateStaff";
import ManagerStaffManage from "./pages/ManagerDashboard/ManagerStaffManage";
import ManagerReceiptList from "./pages/ManagerDashboard/ManagerReceiptList";
import ManagerReceiptDetail from "./pages/ManagerDashboard/ManagerReceiptDetail";
import ManagerProductRequests from "./pages/ManagerDashboard/ManagerProductRequests";
import ManagerStoreRegister from "./pages/ManagerDashboard/ManagerStoreRegister";
import ManagerNotifications from "./pages/ManagerDashboard/ManagerNotifications";
import RequireManagerStore from "./components/RequireManagerStore";
import RequireStaffStore from "./components/RequireStaffStore";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/no-store-assigned"
        element={
          <RequireAuth>
            <NoStoreAssignedPage />
          </RequireAuth>
        }
      />
      <Route path="/home" element={<Home />} />
      <Route path="/admin" element={<RequireAuth><RequireRole allowedRoles={["admin"]}><AdminDashboard /></RequireRole></RequireAuth>} />
      <Route path="/admin/stores" element={<RequireAuth><RequireRole allowedRoles={["admin"]}><AdminStoresManage /></RequireRole></RequireAuth>} />
      <Route path="/admin/rbac" element={<RequireAuth><RequireRole allowedRoles={["admin"]}><AdminRbacManage /></RequireRole></RequireAuth>} />
      <Route
        path="/manager/store/register"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={["manager"]}>
              <ManagerStoreRegister />
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/manager"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={["manager"]}>
              <RequireManagerStore>
                <ManagerDashboard />
              </RequireManagerStore>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/manager/products"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={["manager"]}>
              <RequireManagerStore>
                <ManagerProductList />
              </RequireManagerStore>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/manager/categories"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={["manager", "staff"]}>
              <RequireManagerStore>
                <RequireStaffStore>
                  <Categories />
                </RequireStaffStore>
              </RequireManagerStore>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="/manager/products/new" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerProductCreate /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/products/:id/edit" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerProductEdit /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/products/:id" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerProductDetail /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/invoices" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerInvoicesList /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/invoices/new" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerInvoiceDetail /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/invoices/:id" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerInvoiceDetail /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/stocktakes/pending" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerStocktakePending /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/stocktakes/:id" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerStocktakeDetail /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/adjustments" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerAdjustmentList /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/adjustments/:id" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerAdjustmentDetail /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/incoming-transactions" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerIncomingTransactionsBySupplier /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/receipts" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerReceiptList /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/receipts/:id" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerReceiptDetail /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/product-requests" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerProductRequests /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/suppliers" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerSupplierList /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/suppliers/new" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerSupplierCreate /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/suppliers/:id/edit" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerSupplierEdit /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/staff/new" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerCreateStaff /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/staff/manage" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerStaffManage /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route path="/manager/notifications" element={<RequireAuth><RequireRole allowedRoles={["manager"]}><RequireManagerStore><ManagerNotifications /></RequireManagerStore></RequireRole></RequireAuth>} />
      <Route
        path="/warehouse"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={['warehouse', 'staff', 'manager', 'admin']}>
              <RequireStaffStore>
                <WarehouseDashboard />
              </RequireStaffStore>
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<WarehouseHome />} />
        <Route path="stocktakes" element={<WarehouseStocktakingList />} />
        <Route path="stocktakes/new" element={<WarehouseStocktakingDetail />} />
        <Route path="stocktakes/:id" element={<WarehouseStocktakingDetail />} />
        <Route path="receipts" element={<WarehouseGoodsReceiptList />} />
        <Route path="receipts/new" element={<WarehouseGoodsReceiptCreate />} />
        <Route path="receipts/:id" element={<WarehouseGoodsReceiptDetail />} />
      </Route>

      <Route
        path="/sales"
        element={
          <RequireAuth>
            <RequireRole allowedRoles={['sales', 'staff', 'manager', 'admin']}>
              <SalesDashboard />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="invoices/new" replace />} />
        <Route path="invoices" element={<SalesInvoicesList />} />
        <Route path="invoices/new" element={<SalesInvoiceDetail />} />
        <Route path="returns" element={<SalesInvoicesList />} />
        <Route path="returns/new" element={<SalesReturnPage />} />
        <Route path="customers" element={<SalesCustomerPage />} />
        <Route path="invoices/:id" element={<SalesInvoiceView />} />
        <Route path=":id" element={<SalesInvoiceView />} />
      </Route>
    </Routes>
  );
}

export default App;
