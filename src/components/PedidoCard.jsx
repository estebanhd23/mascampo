
import React from 'react';
export default function PedidoCard({ order, onOpen, onUpdateStatus, onComplete, canEdit }){
  return (
    <div className="border p-3 rounded">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-semibold cursor-pointer" onClick={onOpen}>#{order.id || '—'}</div>
          <div className="text-xs text-gray-600">{order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</div>
          {p?.type === "fruver" && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-medium">
              FRUVER
            </span>
          )}
          <div className="text-sm">Cliente: {order.entrega?.nombre} · {order.entrega?.telefono}</div>
          <div className="text-sm">Total: ${order.total?.toLocaleString?.() || order.total}</div>
        </div>
        {canEdit && (
          <div className="flex flex-col gap-2 w-40">
            <select className="border p-1 rounded" value={order.status} onChange={(e)=>onUpdateStatus(e.target.value)}>
              <option>Pendiente</option>
              <option>En camino</option>
              <option>Completado</option>
            </select>
            <button className="px-2 py-1 bg-green-600 text-white rounded" onClick={onComplete}>Marcar completado</button>
          </div>
        )}
      </div>
    </div>
  );
}
