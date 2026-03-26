// src/components/BebidaSelector.jsx
import React from "react";

export default function BebidaSelector({ current, setCurrent, menu, onExtraDrinkWhileCombo }) {
  if (!current) return null;

  const bebidas = Array.isArray(menu?.bebidas) ? menu.bebidas : [];
  const categories = Array.isArray(menu?.beveragesCategories) ? menu.beveragesCategories : [];

  // ========== helpers estado (LÓGICA INTACTA) ==========
  const getQty = (id) => Math.max(0, Number(current?.bebidas?.[id] || 0));
  const setQty = (id, next) => {
    setCurrent((prev) => {
      const map = { ...(prev?.bebidas || {}) };
      const qty = Math.max(0, Number(next) || 0);
      if (qty <= 0) delete map[id];
      else map[id] = qty;

      // Mantener bebidaId como primera bebida con qty>0 (compat)
      let bebidaId = prev?.bebidaId || "";
      if (qty > 0 && !map[bebidaId]) {
        bebidaId = id;
      } else if (qty === 0 && bebidaId === id) {
        // si quitamos la "primera", elegir otra si existe
        const first = Object.keys(map)[0] || "";
        bebidaId = first || "";
      }

      return { ...prev, bebidas: map, bebidaId };
    });
  };
  const inc = (id) => {
    const was = getQty(id);
    const next = was + 1;
    // Si hay combo y pasamos de 0 -> 1, disparar aviso (una vez controlado arriba)
    if (current?.combo && was === 0) onExtraDrinkWhileCombo?.();
    setQty(id, next);
  };
  const dec = (id) => setQty(id, getQty(id) - 1);

  // === Categorías: construimos listas a partir de beverageIds ===
  const bevMap = new Map(bebidas.map((b) => [b.id, b]));
  const usedIds = new Set();

  const catsResolved = (categories || []).map((c) => {
    const items = (c?.beverageIds || [])
      .map((id) => bevMap.get(id))
      .filter(Boolean);
    items.forEach((it) => usedIds.add(it.id));
    return { ...c, items };
  });

  const unassigned = bebidas.filter((b) => !usedIds.has(b.id));

  // === UI helpers (ESTILOS NUEVOS TIPO RAPPI) ===
  const Card = ({ b }) => {
    const qty = getQty(b.id);
    
    return (
      <div className="relative flex flex-col w-full group">
        
        {/* Contenedor de Imagen */}
        <div className="relative w-full aspect-[4/5] bg-transparent rounded-xl mb-3 flex items-center justify-center">
          {b?.img ? (
            <img 
              src={b.img} 
              alt={b?.name || "Bebida"} 
              className="w-full h-full object-contain object-center mix-blend-multiply" 
            />
          ) : (
            <div className="w-full h-full bg-gray-50 rounded-xl" />
          )}

          {/* Botón flotante (+) o Selector de cantidad */}
          {qty === 0 ? (
            <button
              type="button"
              className="absolute top-1 right-1 w-8 h-8 rounded-full bg-[#3DC957] text-white flex items-center justify-center text-2xl font-medium shadow-sm hover:scale-105 transition-transform"
              onClick={() => inc(b.id)}
              aria-label="Agregar"
            >
              +
            </button>
          ) : (
            <div className="absolute top-1 right-1 h-8 bg-[#3DC957] text-white rounded-full flex items-center shadow-md px-1">
              <button
                type="button"
                className="w-7 h-full flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
                onClick={() => dec(b.id)}
              >
                −
              </button>
              
              {/* Input ocultando las flechitas nativas del navegador */}
              <input
                type="number"
                min={0}
                step={1}
                value={qty}
                onChange={(e) => setQty(b.id, e.target.value)}
                className="w-6 bg-transparent text-center text-sm font-bold text-white outline-none m-0 p-0"
                style={{ appearance: "textfield", WebkitAppearance: "none", MozAppearance: "textfield" }}
              />
              
              <button
                type="button"
                className="w-7 h-full flex items-center justify-center text-xl font-medium active:scale-90 transition-transform"
                onClick={() => inc(b.id)}
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* Textos (Precio y Nombre) */}
        <div className="text-left w-full px-1">
          <div className="text-lg font-bold text-black leading-none">
            ${(Number(b?.precio) || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-700 mt-1.5 leading-snug">
            {b?.name || "Sin nombre"}
          </div>
        </div>
        
      </div>
    );
  };

  const Grid = ({ items }) => (
    // Amplié el gap (espacio entre tarjetas) para que respiren mejor
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
      {items.map((b, idx) => (
        <div key={b?.id ? String(b.id) : `bebida-${idx}`}>
          <Card b={b} />
        </div>
      ))}
    </div>
  );

  const hasCategories = catsResolved.some((c) => c.items.length > 0) || unassigned.length > 0;

  return (
    <div className="space-y-3">
      {/* Sin categorías → render clásico */}
      {!hasCategories ? (
        <div className="mc-bev">
          <Grid items={bebidas} />
        </div>
      ) : (
        <div className="space-y-3 mc-bev">
          {/* Categorías con acordeones nativos */}
          {catsResolved
            .filter((c) => c.items.length > 0)
            .map((cat) => (
              <details key={cat.id} className="border rounded-lg overflow-hidden">
                <summary className="list-none px-4 py-3 bg-gray-50 cursor-pointer font-medium flex items-center justify-between">
                  <span>{cat.name}</span>
                  <span className="text-xs text-gray-500">{cat.items.length} ref.</span>
                </summary>
                <div className="p-4 bg-white">
                  <Grid items={cat.items} />
                </div>
              </details>
          ))}
        </div>
      )}
    </div>
  );
}