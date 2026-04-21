import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Toast } from './components/common';
import ProtectedRoute from './utils/ProtectedRoute';
import { LoginPage, DashboardPage } from './pages';

function App() {
  const { isAuthenticated, token } = useAuth();

  // Initialize token from store on app load
  if (token) {
    // Token is already set from persisted store
  }

  return (
    <Router>
      <Toast />
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
