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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {lista.map((s, idx) => {
        const key = s?.id || `salsa-${idx}`;
        const active = !!current?.salsas?.[s?.id];
        
        return (
          <div
            key={key}
            onClick={() => toggle(s.id)}
            className={`group flex items-center justify-between p-3 border rounded-2xl transition-all duration-200 cursor-pointer select-none ${
              active ? "border-emerald-500 bg-emerald-50/40 shadow-sm" : "border-gray-200 bg-white hover:border-emerald-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-50 shrink-0 border border-gray-100 flex items-center justify-center">
                {s?.img ? (
                  <img src={s.img} alt={s?.name} className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                )}
              </div>
              <span className="font-semibold text-gray-800">{s?.name || "Salsa"}</span>
            </div>

            <div className="pr-2">
              {active ? (
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-sm scale-110 transition-transform">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-gray-300 group-hover:border-emerald-400 transition-colors"></div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}