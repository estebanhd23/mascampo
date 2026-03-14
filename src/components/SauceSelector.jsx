// src/components/SauceSelector.jsx
import React from "react";

export default function SauceSelector({ current, setCurrent, menu }) {
  const lista = Array.isArray(menu?.salsas) ? menu.salsas : [];

  const toggle = (id) => {
    setCurrent((prev) => {
      const cur = { ...(prev?.salsas || {}) };
      cur[id] = !cur[id];
      if (!cur[id]) delete cur[id];
      return { ...prev, salsas: cur };
    });
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {lista.map((s, idx) => {
        const key = s?.id || `salsa-${idx}`;
        const active = !!current?.salsas?.[s?.id];
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(s.id)}
            className={`border rounded p-2 text-left hover:shadow ${active ? "ring-2 ring-emerald-600 border-emerald-600" : ""}`}
          >
            <div className="w-full aspect-video bg-gray-100 rounded overflow-hidden mb-2">
              {s?.img ? <img src={s.img} alt={s?.name || "Salsa"} className="w-full h-full object-cover" /> : null}
            </div>
            <div className="font-medium">{s?.name || "Salsa"}</div>
            {active && <div className="text-xs text-emerald-700 mt-1">Seleccionada</div>}
          </button>
        );
      })}
    </div>
  );
}
