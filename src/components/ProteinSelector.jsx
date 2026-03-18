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

  const handleSubtract = (id, e) => {
    e?.stopPropagation?.();
    const prevQty = current?.proteinas?.[id] || 0;
    if (prevQty > 0) {
      setQty(id, prevQty - 1);
    }
  };

  const handleAdd = (id, e) => {
    e?.stopPropagation?.();
    handleClick(id);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {lista.map((p, idx) => {
        const key = p?.id ? String(p.id) : `protein-${idx}`;
        const qty = current?.proteinas?.[p?.id] || 0;
        const active = qty > 0;

        return (
          <div
            key={key}
            onClick={() => handleClick(p?.id)}
            className={`group flex items-center justify-between p-3 border rounded-2xl transition-all duration-200 cursor-pointer select-none ${
              active ? "border-emerald-500 bg-emerald-50/40 shadow-sm" : "border-gray-200 bg-white hover:border-emerald-300"
            }`}
          >
            {/* Izquierda: Imagen y Nombre */}
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-50 shrink-0 border border-gray-100 flex items-center justify-center">
                {p?.img ? (
                  <img src={p.img} alt={p?.name} className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                )}
              </div>
              <span className="font-semibold text-gray-800">{p?.name || "Proteína"}</span>
            </div>

            {/* Derecha: Controles tipo Stepper */}
            <div className="flex items-center">
              {active ? (
                <div className="flex items-center bg-white rounded-full border border-emerald-500 shadow-sm overflow-hidden h-9" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={(e) => handleSubtract(p.id, e)} className="w-9 h-full flex items-center justify-center text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100 transition-colors">
                    <span className="text-xl leading-none mb-1">−</span>
                  </button>
                  <span className="w-6 text-center font-bold text-emerald-700 text-sm">{qty}</span>
                  <button type="button" onClick={(e) => handleAdd(p.id, e)} className="w-9 h-full flex items-center justify-center text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100 transition-colors">
                    <span className="text-xl leading-none mb-1">+</span>
                  </button>
                </div>
              ) : (
                <button type="button" className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-400 group-hover:border-emerald-500 group-hover:text-emerald-500 group-active:scale-95 transition-all bg-white shadow-sm mr-1">
                  <span className="text-xl leading-none mb-1">+</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}