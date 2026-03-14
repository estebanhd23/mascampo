// src/components/PedidoDetalleModal.jsx
import React from "react";
import { usePedido } from "../context/PedidoContext";

export default function PedidoDetalleModal({ open, onClose, pedido }) {
  const { menu } = usePedido();

  if (!open || !pedido) return null;

  const metodoPago = pedido.entrega?.metodoPago || "—";

  // Helpers para traducir IDs a nombres
  const nameFrom = (arr, id) => arr?.find((x) => x.id === id)?.name || id;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Pedido • {new Date(pedido.createdAt).toLocaleString()}
          </h3>
          <button
            type="button"
            className="text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Datos de entrega */}
          <div className="grid md:grid-cols-2 gap-3">
            <p><span className="font-medium">Modalidad:</span> {pedido?.modalidad || pedido?.entrega?.modalidad || "—"}</p>
            <div><span className="text-gray-600 text-sm">Nombre:</span><div className="font-medium">{pedido.entrega?.nombre || "—"}</div></div>
            <div><span className="text-gray-600 text-sm">Teléfono:</span><div className="font-medium">{pedido.entrega?.telefono || "—"}</div></div>
            <div className="md:col-span-2"><span className="text-gray-600 text-sm">Dirección:</span><div className="font-medium">{pedido.entrega?.direccion || "—"}</div></div>
            <div className="md:col-span-2"><span className="text-gray-600 text-sm">Método de pago:</span><div className="font-medium">{metodoPago}</div></div>
          </div>

          <hr />

          {/* Dentro de la tarjeta de un pedido, para cada item */}
          <ul className="mt-2 space-y-2 text-sm">
            {pedido.items.map((it, idx) => {
              const bowl = menu.bowls.find(b => b.id === it.bowlId);
              const proteNames = Object.entries(it.proteinas || {})
                .flatMap(([id, qty]) => {
                  const p = menu.proteinas.find(x => x.id === id);
                  if (!p) return [];
                  return [`${p.name} ×${qty}`];
                });
              const topNames = Object.entries(it.toppings || {})
                .flatMap(([id, qty]) => {
                  const t = menu.toppings.find(x => x.id === id);
                  if (!t) return [];
                  return [`${t.name} ×${qty}`];
                });
              const salsaNames = Object.entries(it.salsas || {})
                .flatMap(([id, qty]) => {
                  const s = menu.salsas.find(x => x.id === id);
                  if (!s) return [];
                  return [s.name]; // sin cantidades
                });

              const bebidaSuelta = it.bebidaId
                ? menu.bebidas.find(x => x.id === it.bebidaId)
                : null;

              const comboBebida = it.combo && it.comboBebidaId
                ? (menu.combo?.bebidas250 || []).find(x => x.id === it.comboBebidaId)
                : null;

              return (
                <li key={idx} className="border rounded p-2">
                  <div className="font-medium">{bowl?.name || 'Bowl'}</div>
                  {proteNames.length > 0 && (
                    <div className="text-gray-700">Proteínas: {proteNames.join(", ")}</div>
                  )}
                  {topNames.length > 0 && (
                    <div className="text-gray-700">Toppings: {topNames.join(", ")}</div>
                  )}
                  {salsaNames.length > 0 && (
                    <div className="text-gray-700">Salsas: {salsaNames.join(", ")}</div>
                  )}

                  {/* BEBIDA SUELTA */}
                  {bebidaSuelta && (
                    <div className="text-gray-700">Bebida: {bebidaSuelta.name} (${(bebidaSuelta.precio ?? 0).toLocaleString()})</div>
                  )}

                  {/* COMBO */}
                  <div className="text-gray-700">
                    Combo: {it.combo ? `Sí (+$${(menu.combo?.price || 0).toLocaleString()})` : 'No'}
                    {it.combo && comboBebida ? ` — ${comboBebida.name}` : ''}
                  </div>

                  {/* Total por bowl, si lo guardas en cada item */}
                  {typeof it.price === 'number' && (
                    <div className="text-gray-900 font-semibold mt-1">Subtotal: ${it.price.toLocaleString()}</div>
                  )}
                </li>
              );
            })}
          </ul>

        </div>
      </div>
    </div>
  );
}
