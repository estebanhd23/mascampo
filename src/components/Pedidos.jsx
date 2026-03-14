// src/components/Pedidos.jsx
import React, { useState, useEffect } from "react";
import { usePedido } from "../context/PedidoContext";
import PedidoDetalleModal from "./PedidoDetalleModal";

export default function Pedidos() {
  const { pedidosPendientes, pedidosHistorico, completePedido } = usePedido();
  const [detalle, setDetalle] = useState(null); // guarda el pedido seleccionado

  // Cerrar con tecla ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setDetalle(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Card = ({ pedido, isHistorico }) => (
    <div className="border rounded-lg p-4 bg-white shadow-sm space-y-2">
      {/* Encabezado: total + estado */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Total: ${Number(pedido.total || 0).toLocaleString()}</h3>
        <span
          className={`text-xs px-2 py-1 rounded ${
            isHistorico ? "bg-gray-200 text-gray-700" : "bg-yellow-100 text-yellow-800"
          }`}
        >
          {isHistorico ? "Completado" : pedido.status || "Pendiente"}
        </span>
      </div>

      {/* Datos amigables de entrega */}
      {pedido.entrega && (
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="font-medium">Nombre:</span> {pedido.entrega.nombre || "—"}</p>
          <p><span className="font-medium">Teléfono:</span> {pedido.entrega.telefono || "—"}</p>
          <p><span className="font-medium">Dirección:</span> {pedido.entrega.direccion || "—"}</p>
          <p><span className="font-medium">Pago:</span> {pedido.entrega["metodo de pago"] || pedido.entrega.metodoPago || "—"}</p>
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => setDetalle(pedido)}
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          Ver detalle
        </button>

        {!isHistorico && (
          <button
            type="button"
            onClick={() => completePedido(pedido.id)}
            className="px-3 py-1 rounded bg-green-600 text-white text-sm hover:bg-green-700"
          >
            Marcar como completado
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-10">
      {/* Pendientes */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Pendientes</h2>
        {(!pedidosPendientes || pedidosPendientes.length === 0) ? (
          <p className="text-sm text-gray-500">No hay pedidos pendientes.</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pedidosPendientes.map((p) => (
              <Card key={p.id} pedido={p} />
            ))}
          </div>
        )}
      </section>

      {/* Histórico */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Histórico</h2>
        {(!pedidosHistorico || pedidosHistorico.length === 0) ? (
          <p className="text-sm text-gray-500">No hay pedidos en el histórico.</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pedidosHistorico.map((p) => (
              <Card key={p.id} pedido={p} isHistorico />
            ))}
          </div>
        )}
      </section>

      {/* Modal de Detalle */}
      {detalle && (
        <PedidoDetalleModal
          pedido={detalle}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
