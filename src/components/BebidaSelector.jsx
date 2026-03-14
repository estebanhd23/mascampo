// src/components/BebidaSelector.jsx
import React from "react";

export default function BebidaSelector({ current, setCurrent, menu, onExtraDrinkWhileCombo }) {
  if (!current) return null;

  const bebidas = Array.isArray(menu?.bebidas) ? menu.bebidas : [];
  const categories = Array.isArray(menu?.beveragesCategories) ? menu.beveragesCategories : [];

  // ========== helpers estado ==========
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

  // === UI helpers
  const Card = ({ b }) => {
    const qty = getQty(b.id);
    const active = qty > 0;
    return (
      <div
        className={`relative border rounded p-2 hover:shadow ${active ? "ring-2 ring-green-600 border-green-600" : ""}`}
      >
        {active && (
          <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-green-600 text-white text-xs grid place-items-center shadow">
            ✓
          </span>
        )}
        <div className="w-full aspect-video bg-gray-100 rounded overflow-hidden mb-2">
          {b?.img ? (
            <img src={b.img} alt={b?.name || "Bebida"} className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="font-medium">{b?.name || "Sin nombre"}</div>
        <div className="text-xs text-gray-600 mt-1">${(Number(b?.precio) || 0).toLocaleString()}</div>

        {/* Controles de cantidad */}
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center text-lg"
            onClick={() => dec(b.id)}
            aria-label="Quitar"
          >
            –
          </button>
          <input
            type="number"
            min={0}
            step={1}
            value={qty}
            onChange={(e) => setQty(b.id, e.target.value)}
            className="w-16 border rounded text-center py-1"
          />
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center text-lg"
            onClick={() => inc(b.id)}
            aria-label="Agregar"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  const Grid = ({ items }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
      <style>{`
        /* Mantiene tus imágenes "sin recortes" para bebidas */
        .mc-bev img { width: 100%; height: 100%; object-fit: contain !important; object-position: center; }
      `}</style>

      {/* Sin categorías → render clásico (retrocompatible) */}
      {!hasCategories ? (
        <div className="mc-bev">
          <Grid items={bebidas} />
        </div>
      ) : (
        <div className="space-y-3 mc-bev">
          {/* Categorías con acordeones nativos (sin estado extra) */}
          {catsResolved
            .filter((c) => c.items.length > 0)
            .map((cat) => (
              <details key={cat.id} className="border rounded-lg overflow-hidden">
                <summary className="list-none px-4 py-3 bg-gray-50 cursor-pointer font-medium flex items-center justify-between">
                  <span>{cat.name}</span>
                  <span className="text-xs text-gray-500">{cat.items.length} ref.</span>
                </summary>
                <div className="p-3">
                  <Grid items={cat.items} />
                </div>
              </details>
          ))}

          {/* “Sin categoría” → todo lo no asignado */}
          {unassigned.length > 0 && (
            <details className="border rounded-lg overflow-hidden">
              <summary className="list-none px-4 py-3 bg-gray-50 cursor-pointer font-medium flex items-center justify-between">
                <span>Otras bebidas</span>
                <span className="text-xs text-gray-500">{unassigned.length} ref.</span>
              </summary>
              <div className="p-3">
                <Grid items={unassigned} />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
