import React from 'react';

export default function ComboSelector({ current, setCurrent, menu }) {
  if (!current) return null;

  const comboPrice = Number(menu?.combo?.price ?? 0);
  const opciones250 = Array.isArray(menu?.combo?.bebidas250) ? menu.combo.bebidas250 : [];

  return (
    <div>
      <h4 className="font-semibold mb-2">¿Quieres combo? (+${comboPrice.toLocaleString()})</h4>
      <div className="flex gap-3">
        <button
          className={`px-4 py-2 rounded ${current.combo ? 'bg-green-600 text-white' : 'bg-gray-100'}`}
          onClick={() => setCurrent({ ...current, combo: true })}
        >
          Sí
        </button>
        <button
          className={`px-4 py-2 rounded ${current.combo === false ? 'bg-red-600 text-white' : 'bg-gray-100'}`}
          onClick={() => setCurrent({ ...current, combo: false, comboBebidaId: '' })}
        >
          No
        </button>
      </div>

      {current.combo && opciones250.length > 0 && (
        <div className="mt-2 flex gap-3 flex-wrap">
          {opciones250.map((b) => (
            <label key={String(b?.id)} className="flex items-center gap-2">
              <input
                type="radio"
                name="combo250"
                checked={current.comboBebidaId === b?.id}
                onChange={() => setCurrent({ ...current, comboBebidaId: b?.id })}
              />
              {b?.name || 'Bebida 250ml'}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
