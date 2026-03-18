// src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { usePedido } from '../context/PedidoContext'; 
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const { user, login, role, menu } = usePedido(); 
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // NUEVO: Temporizador para no quedarnos atrapados en la pantalla de carga
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  const headerLogo = menu?.headerLogoUrl || menu?.logoUrl || menu?.footerLogoUrl || "";

  // Si el usuario existe, le damos 2 segundos a Firestore para que nos diga si es admin
  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        setIsCheckingRole(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [user]);

  // Lógica de redirección
  if (user) {
    // Si ya confirmó que es admin u operator, entra a la Intranet de inmediato
    if (role === 'admin' || role === 'operator') {
        const from = location.state?.from || '/intranet';
        return <Navigate to={from} replace />;
    }
    
    // Si sigue cargando (dentro de los 2 segundos), mostramos el spinner
    if (isCheckingRole) {
        return (
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
            <div className="w-12 h-12 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 font-medium animate-pulse">Verificando acceso seguro...</p>
          </div>
        );
    }
    
    // Si pasaron los 2 segundos y NO es admin, lo mandamos a la tienda como cliente normal
    const from = location.state?.from || '/';
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      await login(email, pass);

      try {
        const params = new URLSearchParams(window.location.search);
        const src = params.get("src");
        if (src === "alianzas") {
          nav("/alianzas-activar", { replace: true });
          return;
        }
      } catch (e) {}

    } catch (err) {
      setError('Correo o contraseña incorrectos. Intenta nuevamente.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-8 sm:p-10 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>

        <div className="flex justify-center mb-6 relative z-10">
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center overflow-hidden">
            {headerLogo ? (
              <img src={headerLogo} alt="Logo Más Campo" className="w-full h-full object-cover" />
            ) : (
              <div className="text-emerald-700 font-extrabold text-xl text-center leading-tight">
                Más<br/>Campo
              </div>
            )}
          </div>
        </div>

        <div className="text-center mb-8 relative z-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">¡Hola de nuevo!</h1>
          <p className="text-gray-500 text-sm mt-2">Ingresa tus credenciales para continuar.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 relative z-10">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-100 text-center font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Correo electrónico</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="ejemplo@correo.com"
              required
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 focus:bg-white transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 focus:bg-white transition-all"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-white font-bold text-base transition-all shadow-sm
              ${isSubmitting 
                ? 'bg-emerald-400 cursor-not-allowed' 
                : 'bg-emerald-600 hover:bg-emerald-500 hover:shadow-md active:scale-[0.98]'
              }`}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Iniciando...
              </>
            ) : (
              'Entrar a mi cuenta'
            )}
          </button>
        </form>
        
        <div className="mt-8 text-center relative z-10">
          <Link to="/" className="text-sm font-medium text-gray-400 hover:text-emerald-600 transition-colors">
            ← Volver a la tienda
          </Link>
        </div>
      </div>
    </div>
  );
}