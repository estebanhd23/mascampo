import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePedido } from '../context/PedidoContext';

export function ProtectedRoute({ children }) {
  const { user } = usePedido();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export function AdminRoute({ children }) {
  const { user, role } = usePedido();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role !== 'admin') return <Navigate to="/" replace />;

  return children;
}
