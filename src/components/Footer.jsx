// src/components/Footer.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { usePedido } from "../context/PedidoContext";

export default function Footer({ showIntranetLink }) {
  const { user, logout } = usePedido();
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-gray-200/60 bg-transparent mt-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Marca y Copyright */}
        <div className="text-sm text-gray-400 font-medium tracking-wide">
          © {year} Más Campo
        </div>

        {/* Opciones de Sesión e Intranet */}
        <div className="flex items-center gap-6 text-sm">
          {!user ? (
            <NavLink
              to="/login"
              className="text-gray-400 hover:text-emerald-600 transition-colors font-medium"
            >
              Iniciar sesión
            </NavLink>
          ) : (
            <>
              {(showIntranetLink || user?.email === 'mascampomzl@gmail.com')  && (
                <NavLink
                  to="/intranet"
                  className="text-emerald-600 hover:text-emerald-700 font-bold transition-colors"
                >
                  Intranet
                </NavLink>
              )}
              <button
                onClick={logout}
                className="text-gray-400 hover:text-red-500 transition-colors font-medium outline-none"
              >
                Cerrar sesión
              </button>
            </>
          )}
        </div>

      </div>
    </footer>
  );
}