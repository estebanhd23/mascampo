import React, { useMemo } from "react";

export default function ProteinSelector({ current, setCurrent, menu, ackExtras = false, onNeedExtras }) {
  const lista = Array.isArray(menu?.proteinas) ? menu.proteinas : [];
  const bowl = menu?.bowls?.find((b) => b.id === current?.bowlId);
  const incluidas = Number(bowl?.proteinasIncluidas || 0);

  const totalSeleccionadas = useMemo(
    () => Object.values(current?.proteinas || {}).reduce((a, c) => a + c, 0),
    [current?.proteinas]
  );

  const setQty = (id, qty) => {
    setCurrent((prev) => ({
      ...prev,
      proteinas: { ...(prev.proteinas || {}), [id]: qty },
    }));
  };

  const handleClick = (id) => {
    if (!id) return;
    const prevQty = current?.proteinas?.[id] || 0;
    const nextQty = prevQty + 1;
    const newTotal = totalSeleccionadas - prevQty + nextQty;

    if (newTotal > incluidas && !ackExtras) {
      onNeedExtras?.(incluidas, totalSeleccionadas, () => setQty(id, nextQty));
      return;
    }
    setQty(id, nextQty);
  };

  const clearItem = (id, e) => {
    // Evita que el clic en “Quitar” también dispare el clic del card
    e?.stopPropagation?.();
    setQty(id, 0);
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">
        Incluidas: {incluidas} · Seleccionadas: {totalSeleccionadas}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {lista.map((p, idx) => {
          const key = p?.id ? String(p.id) : `protein-${idx}`;
          const qty = current?.proteinas?.[p?.id] || 0;
          const active = qty > 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleClick(p?.id)}
              className={`relative border rounded p-2 hover:shadow text-left w-full ${
                active ? "ring-2 ring-emerald-600 border-emerald-600" : ""
              }`}
              // Mantiene exactamente el mismo aspecto pero hace clic en todo el card
            >
              {active && p?.id && (
                <button
                  type="button"
                  onClick={(e) => clearItem(p.id, e)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs grid place-items-center shadow"
                  title="Quitar"
                >
                  ×
                </button>
              )}

              <div className="w-full aspect-video bg-gray-100 rounded overflow-hidden mb-2">
                {p?.img ? (
                  <img src={p.img} alt={p?.name || "Proteína"} className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="font-medium">{p?.name || "Proteína"}</div>
              {active && <div className="text-xs text-emerald-700 mt-1">Cantidad: {qty}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
