// src/pages/Login.jsx
import React, { useState } from 'react';
// IMPORTANTE: Asegúrate de desestructurar 'role' del usePedido
import { usePedido } from '../context/PedidoContext'; 
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

export default function Login() {
  // Asegúrate de que 'role' esté disponible en la desestructuración
  const { user, login, role } = usePedido(); 
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  // 1. Lógica de redirección INMEDIATA (si ya está logueado)
  if (user) {
    // Si el rol es el valor por defecto ('viewer') y el usuario acaba de iniciar sesión, 
    // significa que el rol real aún no ha cargado de Firestore.
    // Devolvemos NULL o un mensaje de carga para esperar el re-render.
    
    if (role === 'viewer') {
        // Podríamos añadir una comprobación de tiempo para evitar bucles si el rol falla, 
        // pero por ahora, simplemente dejamos que el componente se re-renderice hasta que el rol cambie.
        return (
             <div className="min-h-[70vh] flex items-center justify-center p-6 text-gray-600">
                Verificando credenciales PRO...
            </div>
        );
    }
    
    // El rol ya está cargado y NO es el valor por defecto ('viewer'):

    // A. Prioridad alta: Restaurant
    
    // B. Prioridad media: Staff (Admin u Operator)
    if (role === 'admin' || role === 'operator') {
        const from = location.state?.from || '/intranet';
        return <Navigate to={from} replace />;
    }
    
    // C. Rol 'viewer' (una vez que se ha cargado de Firestore y sigue siendo viewer): Cliente B2C.
    // Lo enviamos a la ruta solicitada o al home principal.
    const from = location.state?.from || '/';
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // 1. Inicia sesión (esto actualiza el 'user' y dispara la carga asíncrona del 'role')
      await login(email, pass);

      // 2. Lógica de alianzas: Esta es una excepción de redirección forzada.
      try {
        const params = new URLSearchParams(window.location.search);
        const src = params.get("src");
        if (src === "alianzas") {
          nav("/alianzas-activar", { replace: true });
          return;
        }
      } catch (e) {}

      // NOTA: Eliminamos la redirección por defecto a /intranet de aquí.
      // El bloque 'if (user)' al inicio del componente manejará la redirección final.
      
    } catch (err) {
      setError(err?.message || 'Error de inicio de sesión');
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm border rounded-lg p-6 space-y-4">
        <h1 className="text-xl font-semibold">Iniciar sesión</h1>
        {error && <div className="text-red-600 text-sm">{error}</div>}

        <div>
          <label className="block text-sm text-gray-700 mb-1">Correo</label>
          <input
            type="email"
            autoComplete="email"
            className="w-full border p-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Contraseña</label>
          <input
            type="password"
            autoComplete="current-password"
            className="w-full border p-2 rounded"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </div>

        <button type="submit" className="w-full px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700">
          Entrar
        </button>
      </form>
    </div>
  );
}