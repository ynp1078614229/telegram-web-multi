import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AccountDetailPage from './pages/AccountDetailPage'
import BotSettingsPage from './pages/BotSettingsPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_token')
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/account/:id" element={<PrivateRoute><AccountDetailPage /></PrivateRoute>} />
        <Route path="/bot" element={<PrivateRoute><BotSettingsPage /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
