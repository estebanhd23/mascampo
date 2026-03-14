// src/components/HowToBowlModal.jsx
import React, { useMemo, useState } from "react";

export default function HowToBowlModal({ open, onClose, menu }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const protExtraPrice = useMemo(
    () => Number(menu?.proteinas?.[0]?.extraPrice ?? 5500),
    [menu?.proteinas]
  );
  const topExtraPrice = useMemo(
    () => Number(menu?.toppings?.[0]?.extraPrice ?? 3000),
    [menu?.toppings]
  );
  const comboPrice = useMemo(
    () => Number(menu?.combo?.price ?? 7000),
    [menu?.combo?.price]
  );

  if (!open) return null;

  const handleClose = () => onClose?.(dontShowAgain);

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/40"
      aria-modal="true"
      role="dialog"
    >
      {/* Capa scrollable que respeta notch/safe areas */}
      <div
        className="absolute inset-0 overflow-y-auto"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 12px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
        }}
      >
        {/* Contenedor que centra en desktop y deja espacio arriba en mobile */}
        <div className="min-h-full flex items-start sm:items-center justify-center px-3 sm:px-6">
          {/* Card con layout de 3 zonas: header/body/footer y scroll solo en body */}
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
            style={{
              // Altura máxima segura en móvil y desktop (usa dvh cuando está disponible)
              maxHeight: "min(88vh, calc(100dvh - 48px))",
            }}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">¡Arma tu bowl en 4 pasos!</h3>
              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 grid place-items-center rounded hover:bg-gray-100"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Body (scrolla si hace falta) */}
            <div className="p-5 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Paso 1 */}
                <div className="border rounded-xl p-4 bg-gray-50">
                  <div className="text-3xl">🥣</div>
                  <div className="mt-2 font-semibold">1) Arma tu bowl</div>
                  <p className="text-sm text-gray-600">
                    Elige entre <b>Semilla</b>, <b>Brote</b> o <b>Cosecha.</b>
                  </p>
                </div>

                {/* Paso 2 */}
                <div className="border rounded-xl p-4 bg-gray-50">
                  <div className="text-3xl">🍗</div>
                  <div className="mt-2 font-semibold">2) ¿Quieres más proteína?</div>
                  <p className="text-sm text-gray-600">
                    Adicionala por (~${protExtraPrice.toLocaleString("es-CO")} c/u).
                  </p>
                </div>

                {/* Paso 3 */}
                <div className="border rounded-xl p-4 bg-gray-50">
                  <div className="text-3xl">🥗🧂</div>
                  <div className="mt-2 font-semibold">3) Toppings & Salsas</div>
                  <p className="text-sm text-gray-600">
                    Elige las salsas que quieras (gratis). Toppings adicionales (~$
                    {topExtraPrice.toLocaleString("es-CO")} c/u).
                  </p>
                </div>

                {/* Paso 4 */}
                <div className="border rounded-xl p-4 bg-gray-50">
                  <div className="text-3xl">🥤➕🍟</div>
                  <div className="mt-2 font-semibold">4) Para acompañar</div>
                  <p className="text-sm text-gray-600">
                    Chips + bebidas por {" "}
                    <b>${comboPrice.toLocaleString("es-CO")}</b>.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border bg-white p-3 text-sm text-gray-700">
                El precio se <b>actualiza solo</b> con extras, bebida o combo.
              </div>
            </div>

            {/* Footer fijo */}
            <div className="px-5 py-4 border-t flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                />
                No volver a mostrar
              </label>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
              >
                ¡Listo, a armarlo!
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
