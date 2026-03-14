// src/components/OrderGuidance.jsx
import React, { useMemo } from "react";

export default function OrderGuidance({ menu }) {
  const extraP = useMemo(
    () => menu?.proteinas?.[0]?.extraPrice ?? 5500,
    [menu]
  );
  const extraT = useMemo(
    () => menu?.toppings?.[0]?.extraPrice ?? 3000,
    [menu]
  );

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-600 text-white grid place-items-center text-lg shrink-0">
          ℹ️
        </div>
        <div className="text-emerald-900">
          <p className="font-semibold">Arma tu bowl paso a paso</p>
          <ul className="list-disc ml-5 text-sm mt-1 space-y-1">
            <li>Primero elige tus <b>proteínas</b> y luego tus <b>toppings</b>. Después agrega <b>salsas</b> y opcionalmente <b>bebida</b> o <b>combo</b>.</li>
            <li>Si superas lo incluido, podrás añadir <b>extras</b>:
              <span className="ml-1">
                proteínas <b>+$ {extraP.toLocaleString()}</b> c/u,
                toppings <b>+$ {extraT.toLocaleString()}</b> c/u.
              </span>
            </li>
            <li>Puedes volver a cualquier paso tocando el encabezado (Proteínas / Toppings / Salsas / Bebidas / Combo).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
