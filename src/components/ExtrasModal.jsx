import React from "react";

export default function ExtrasModal({
  open,
  type,            // 'protein' | 'topping'
  included = 0,
  currentCount = 0,
  extraPrice = 0,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  const label = type === "protein" ? "proteína" : "topping";
  const plural = type === "protein" ? "proteínas" : "toppings";
  const nextCount = currentCount + 1;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-5">
        <h3 className="text-lg font-semibold mb-2">Agregar {label} extra</h3>
        <p className="text-sm text-gray-700">
          Tu bowl incluye <strong>{included}</strong> {plural}. Estás intentando agregar{" "}
          <strong>{nextCount}</strong>. Cada {label} extra tiene un costo de{" "}
          <strong>${extraPrice.toLocaleString()}</strong>.
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            No, continuar sin extras
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
          >
            Sí, agregar extra
          </button>
        </div>
      </div>
    </div>
  );
}
