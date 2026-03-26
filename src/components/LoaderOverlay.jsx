import React from "react";
import { createPortal } from "react-dom";

export default function LoaderOverlay({ show = false, logoUrl = "" }) {
  if (!show) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes mc-breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.95); opacity: 0.7; }
        }
        @keyframes mc-line-load {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      <div
        role="status"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-white"
      >
        <div className="flex flex-col items-center">
          
          {/* Logo con animación de respiración suave */}
          <div className="relative mb-8">
      {logoUrl ? (
        // SI HAY URL, MOSTRAMOS LA IMAGEN
        <img
          src={logoUrl}
          alt="Más Campo"
          // Mantenemos un tamaño elegante (20-24 de altura)
          className="h-20 sm:h-24 w-auto object-contain"
          // Aplicamos la animación de respiración suave que definimos en los estilos
          style={{ animation: "mc-breathe 2.5s ease-in-out infinite" }}
        />
      ) : (
        // SI NO HAY URL, MOSTRAMOS EL CÍRCULO POR DEFECTO
        <div 
          className="h-12 w-12 rounded-full bg-emerald-600"
          style={{ animation: "mc-breathe 2.5s ease-in-out infinite" }}
        />
      )}
    </div>

          {/* Indicador de carga ultra-minimalista */}
          <div className="w-32 h-[2px] bg-gray-100 rounded-full overflow-hidden relative">
            <div 
              className="absolute inset-0 bg-emerald-600 w-1/2 rounded-full"
              style={{ 
                animation: "mc-line-load 1.8s cubic-bezier(0.65, 0, 0.35, 1) infinite" 
              }}
            />
          </div>

          {/* Texto sutil */}
          <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium">
            Cargando frescura
          </p>
        </div>
      </div>
    </>,
    document.body
  );
}