import './App.css';
import { Routes, Route, Navigate } from "react-router-dom";
import AuthPage from './pages/AuthPage/AuthPage';
import Home from "./pages/HomePageUser/Home";
import AdminDashboard from "./pages/AdminHome/AdminDashBoard";
import Categories from "./pages/Categories/Categories";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage />} />
      <Route path="/resetpassword" element={<AuthPage />} />
      <Route path="/home" element={<Home />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/categories" element={<Categories />} />
    </Routes>
  );
}

export default App;
