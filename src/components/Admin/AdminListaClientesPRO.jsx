// src/components/Admin/AdminListaClientesPRO.jsx

import React, { useState, useMemo } from 'react';
import useFetchAllUsers from '../../hooks/useFetchAllUsers'; 
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { usePedido } from '../../context/PedidoContext';
import EditUserModal from './EditUserModal'; 


export default function AdminListaClientesPRO() {
  // 1. OBTENCIÓN DE DATOS Y ESTADOS
  const { users, loading, error } = useFetchAllUsers();
  const { deleteClientDoc } = usePedido();
  
  const [editingUser, setEditingUser] = useState(null); 
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all'); 
  
  const auth = getAuth();

  // 🛑🛑 DEFINICIÓN CRÍTICA: useMemo debe estar aquí 🛑🛑
  const filteredUsers = useMemo(() => {
    // Si users aún no está cargado o tiene errores, retornamos un array vacío
    if (!users) return [];
    
    return users.filter(user => {
      // Filtrar por Rol
      const roleMatch = filterRole === 'all' || user.role === filterRole;

      // Filtrar por Búsqueda (nombre o email)
      const searchLower = search.toLowerCase();
      const nameMatch = user.nombre?.toLowerCase().includes(searchLower) || false;
      const emailMatch = user.email?.toLowerCase().includes(searchLower) || false;

      return roleMatch && (nameMatch || emailMatch);
    });
  }, [users, search, filterRole]); 
  // 🛑🛑 FIN DE DEFINICIÓN CRÍTICA 🛑🛑


  // 2. Función de Restablecimiento de Clave (se mantiene)
  const handleResetPassword = async (email) => {
    if (!window.confirm(`¿Está seguro de enviar un correo de restablecimiento de clave a ${email}?`)) {
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Correo de restablecimiento enviado con éxito a ${email}. El cliente deberá revisar su bandeja de entrada.`);
    } catch (e) {
      alert(`Error al enviar el correo: ${e.message}.`);
    }
  };
  
  // 3. Función de Cambio de Rol (se mantiene)
  const handleUpdateRole = async (userId, newRole) => {
      if (!window.confirm(`¿Confirma cambiar el rol del usuario a ${newRole}?`)) return;

      try {
          const userRef = doc(db, "users", userId);
          await updateDoc(userRef, { role: newRole });
          alert(`Rol actualizado a ${newRole}`);
      } catch (e) {
          alert(`Error al actualizar el rol: ${e.message}`);
      }
  };
  
  // 4. FUNCIÓN DE ELIMINACIÓN DE USUARIO (se mantiene)
  const handleDeleteUser = async (user) => {
      if (!window.confirm(`ADVERTENCIA CRÍTICA: ¿Está seguro de ELIMINAR el registro de Firestore del cliente ${user.nombre} (${user.email})? 
      \n\n* Esto eliminará permanentemente su registro en Firestore y su historial.
      \n* DEBERÁ ELIMINAR LA CUENTA EN LA CONSOLA DE FIREBASE AUTH MANUALMENTE.`)) {
        return;
      }
      try {
          await deleteClientDoc(user.id); 
          
          alert(`Cliente ${user.nombre} ELIMINADO de Firestore. 
          *** ACCIÓN PENDIENTE: Por favor, elimine el usuario ${user.email} de la CONSOLA de Firebase AUTH para completar la eliminación.`);
      } catch (e) {
          alert(`Error al eliminar el cliente: ${e.message}`);
      }
  };

  if (loading) return <div className="text-center p-8">Cargando clientes...</div>;
  if (error) return <div className="p-4 text-red-600 border border-red-300 rounded">{error}</div>;
    
  // Si no hay usuarios y no está cargando, mostramos un mensaje
  if (users?.length === 0) return <div className="text-center p-8 text-gray-500">No hay usuarios registrados en Firestore.</div>;


  return (
    <div className="p-8 bg-white rounded-lg shadow-xl">
      <h2 className="text-2xl font-bold text-green-700 mb-6">Lista de Clientes Registrados ({filteredUsers.length})</h2>

      {/* Controles de Búsqueda y Filtro */}
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre o correo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="p-2 border rounded-lg flex-grow max-w-sm"
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="p-2 border rounded-lg"
        >
          <option value="all">Todos los Roles</option>
          <option value="restaurant">Restaurante PRO</option>
          <option value="mayorista">Mayorista</option>
          <option value="admin">Administrador</option>
          <option value="operator">Operador</option>
          <option value="viewer">Cliente General</option>
        </select>
      </div>

      {/* Tabla de Clientes */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-green-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Correo (Login)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rol</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.nombre || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.telefono || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                    <select 
                        value={u.role || 'viewer'}
                        onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                        className={`p-1 border rounded-md text-xs font-semibold ${u.role === 'restaurant' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}
                    >
                        <option value="viewer">Cliente</option>
                        <option value="restaurant">Restaurante</option>
                        <option value="mayorista">Mayorista</option>
                        <option value="operator">Operador</option>
                        <option value="admin">Admin</option>
                    </select>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {/* Botón Editar */}
                    <button
                        onClick={() => setEditingUser(u)} 
                        className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition mr-2"
                    >
                        Editar
                    </button>

                  {/* Botón Resetear Clave */}
                  <button
                    onClick={() => handleResetPassword(u.email)}
                    className="px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition mr-2"
                  >
                    Resetear Clave
                  </button>
                  
                  {/* Botón Eliminar */}
                  <button
                    onClick={() => handleDeleteUser(u)}
                    className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
                 <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">No se encontraron clientes con esos filtros.</td>
                 </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Modal de Edición */}
      {editingUser && (
        <EditUserModal
            user={editingUser}
            onClose={() => setEditingUser(null)}
        />
      )}

    </div>
  );
}