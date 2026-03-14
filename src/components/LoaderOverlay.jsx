// src/components/LoaderOverlay.jsx
import React from "react";
import { createPortal } from "react-dom";

export default function LoaderOverlay({ show = false, logoUrl = "" }) {
  if (!show) return null;

  return createPortal(
    <>
      <style>{`
        /* Animaciones suaves */
        @keyframes mc-pulse {
          0%, 100% { transform: scale(0.98); opacity: .95; }
          50% { transform: scale(1); opacity: 1; }
        }
        @keyframes mc-orbit {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes mc-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes mc-shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mc-anim, .mc-orbit-anim, .mc-float-anim, .mc-shimmer {
            animation: none !important;
          }
        }
      `}</style>

      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-[9999] flex items-center justify-center"
      >
        {/* Fondo con gradiente “campestre” */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-amber-50 to-white" />

        {/* Bokeh sutil */}
        <div className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-emerald-200/30 blur-3xl" />
        <div className="absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-amber-200/40 blur-3xl" />

        {/* Contenido */}
        <div className="relative w-[min(92vw,520px)] rounded-2xl border border-emerald-100/70 bg-white/80 backdrop-blur-xl shadow-xl p-6 sm:p-8">
          {/* Aro luminoso + logo */}
          <div className="relative mx-auto w-28 h-28 sm:w-32 sm:h-32">
            {/* Aro brillo */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-300/60 via-lime-300/50 to-amber-300/60 blur-md" />
            <div className="absolute inset-[6px] rounded-full bg-white shadow-inner" />
            {/* Logo */}
            <div className="relative z-10 grid h-full w-full place-items-center">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Mas Campo"
                  className="h-14 sm:h-16 w-auto object-contain mc-anim"
                  style={{ animation: "mc-pulse 2.4s ease-in-out infinite" }}
                />
              ) : (
                <div
                  className="h-10 w-10 rounded-full bg-emerald-600 mc-anim"
                  style={{ animation: "mc-pulse 2.4s ease-in-out infinite" }}
                />
              )}
            </div>

            {/* Órbita de iconos (gira completa) */}
            <div
              className="absolute inset-[-6px] rounded-full mc-orbit-anim"
              style={{ animation: "mc-orbit 9s linear infinite" }}
            >
              {/* Manzana */}
              <IconApple className="absolute -top-3 left-1/2 -translate-x-1/2 text-rose-500 drop-shadow-[0_1px_2px_rgba(0,0,0,.15)]" />
              {/* Zanahoria */}
              <IconCarrot className="absolute -right-3 top-1/2 -translate-y-1/2 text-amber-500 drop-shadow-[0_1px_2px_rgba(0,0,0,.15)]" />
              {/* Hoja */}
              <IconLeaf className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-emerald-500 drop-shadow-[0_1px_2px_rgba(0,0,0,.15)]" />
            </div>
          </div>

          {/* Texto */}
          <div className="mt-6 text-center">
            <div className="text-base sm:text-lg font-semibold text-gray-800">
              Preparando tu experiencia <span className="text-emerald-700">Mas Campo</span>
            </div>
            <div className="mt-1 text-sm text-gray-500">
              Gastro · Fruver · Fresco cada día
            </div>
          </div>

          {/* Barra “shimmer” */}
          <div className="mt-6">
            <div className="h-2 w-full rounded-full bg-gray-200/70 overflow-hidden">
              <div
                className="h-full w-1/2 rounded-full mc-shimmer"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(16,185,129,0) 0%, rgba(16,185,129,.45) 50%, rgba(16,185,129,0) 100%)",
                  backgroundSize: "200% 100%",
                  animation: "mc-shimmer 1.4s ease-in-out infinite",
                }}
              />
            </div>
          </div>

          {/* Mini nota */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mc-float-anim"
              style={{ animation: "mc-float 2.4s ease-in-out infinite" }}
            />
            Cargando…
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ====== Iconos inline (SVG) ====== */
function IconApple({ className = "" }) {
  return (
    <svg className={`h-6 w-6 ${className}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 13.5c0 3.59-2.91 6.5-6.5 6.5S6 17.09 6 13.5C6 10 9 8 12.5 8S19 10 19 13.5z" />
      <path d="M12.5 7c1.38 0 2.5-1.34 2.5-3 0-.41-.08-.79-.22-1.13C13.9 3.08 12.96 3.5 12 3.5 10.62 3.5 9.5 4.84 9.5 6.5c0 .41.08.79.22 1.13.88-.21 1.82-.63 2.78-.63z" />
      <path d="M8.5 9s.5 1.5-1 3c-1.05 1.08-1 3 1 3 1.15 0 2-.85 2-2 0-1.5-2-4-2-4z" opacity=".35" />
    </svg>
  );
}

function IconCarrot({ className = "" }) {
  return (
    <svg className={`h-6 w-6 rotate-12 ${className}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 21c-1.66 0-3-1.34-3-3 0-2 3-5 6-7 3-2 6-3 8-3-2 2-3 5-5 8-2 3-5 6-7 6z" />
      <path d="M17 4c1.1 0 2 .9 2 2 0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1 0-1.1.9-2 2-2z" opacity=".4"/>
    </svg>
  );
}

function IconLeaf({ className = "" }) {
  return (
    <svg className={`h-6 w-6 -rotate-12 ${className}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3C7 3 3 7 3 12c0 4.97 4 9 9 9s9-4.03 9-9c0-2.21-.8-4.23-2.12-5.8-1.28 2.4-3.7 4.1-6.64 4.7C10.1 11.5 8.5 13 8.5 15c0 2 1.5 3.5 3.5 3.5 2.76 0 5-2.24 5-5 0-5-5-10.5-5-10.5z"/>
    </svg>
  );
}
