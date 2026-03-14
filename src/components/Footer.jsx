// src/components/Footer.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { usePedido } from "../context/PedidoContext";

// El componente Shell YA ESTÁ PASANDO el prop showIntranetLink
// Ahora, el Footer necesita recibirlo.
export default function Footer({ logoUrl, showIntranetLink }) { // <-- Aceptamos el nuevo prop
  const { menu, user, role, logout } = usePedido();

  // Logo: prioridad footerLogo -> prop -> logo general
  const logo =
    menu?.footerLogoUrl ||
    logoUrl ||
    menu?.logoUrl ||
    "";

  const year = new Date().getFullYear();

  // Datos opcionales desde settings (si existen)
  const phone = menu?.settings?.contact?.phone || "";
  const email = menu?.settings?.contact?.email || "";
  const address = menu?.settings?.contact?.address || "";

  return (
    <footer className="mt-10 bg-brand-900 text-white">
      {/* Franja principal */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          {/* Marca */}
          <div className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt="Logo" className="h-9 w-auto rounded-sm bg-white/5 p-1" />
            ) : (
              <div className="h-9 w-9 rounded bg-white/20" />
            )}
            <div>
              <div className="text-sm opacity-90">Mas Campo</div>
              <div className="text-xs text-white/70">
                Hecho con 💚 · {address || "Colombia"}
              </div>
            </div>
          </div>

          {/* CTA / Sesión */}
          <div className="flex flex-wrap items-center gap-3">
            {!user ? (
              // ⬇️ Botón minimalista (sin cambios)
              <NavLink
                to="/login"
                className="text-xs text-white/70 hover:text-white underline-offset-4 hover:underline transition"
                title="Iniciar sesión"
              >
                Iniciar sesión
              </NavLink>
            ) : (
              <div className="flex items-center gap-2">
                {/* LÓGICA DE VISIBILIDAD DE INTRANET */}
                {/* Solo mostramos el botón a Intranet si showIntranetLink es TRUE (es decir, admin u operator) */}
                {showIntranetLink && (
                  <NavLink
                      to="/intranet"
                      className="rounded-xl px-3 py-2 bg-white/10 hover:bg-white/15 backdrop-blur border border-white/10 text-white text-sm transition"
                  >
                      Ir a Intranet
                  </NavLink>
                )}
                
                <button
                  onClick={logout}
                  className="rounded-xl px-3 py-2 bg-red-500/90 hover:bg-red-500 text-white text-sm transition"
                >
                  Salir
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Separador suave */}
        <div className="my-6 h-px bg-white/10" />
            
        {/* Enlaces & contacto */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
          <div className="space-y-2">
            <div className="font-semibold text-white/90">Explorar</div>
            <nav className="flex flex-col gap-1">
              <NavLink to="/cliente" className="text-white/70 hover:text-white">
                Arma tu Bowl
              </NavLink>
              <NavLink to="/fruver" className="text-white/70 hover:text-white">
                Fruver
              </NavLink>
              <NavLink to="/" className="text-white/70 hover:text-white">
                Inicio
              </NavLink>
            </nav>
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-white/90">Soporte</div>
            <div className="flex flex-col gap-1">
              {phone ? (
                <a href={`tel:${phone}`} className="text-white/70 hover:text-white">
                  {phone}
                </a>
              ) : (
                <span className="text-white/50">312 2209221</span>
              )}
              {email ? (
                <a href={`mailto:${email}`} className="text-white/70 hover:text-white">
                  {email}
                </a>
              ) : (
                <span className="text-white/50">mascampomzl@gmail.com</span>
              )}
              {address ? (
                <span className="text-white/70">{address}</span>
              ) : (
                <span className="text-white/50">Carrera 24a #60 - 33 | Barrio la estrella</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-semibold text-white/90">Legal</div>
            <div className="flex flex-col gap-1">
              <NavLink to="/terminos" className="text-white/70 hover:text-white">
                Términos y condiciones
              </NavLink>
              <NavLink to="/privacidad" className="text-white/70 hover:text-white">
                Política de privacidad
              </NavLink>
            </div>
          </div>
        </div>
        

        {/* Copy */}
        <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-white/60">
          <div>© {year} Mas Campo — Todos los derechos reservados</div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Tiempo real</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}