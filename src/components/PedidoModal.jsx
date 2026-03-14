
import React from 'react';
export default function PedidoModal({ open, onClose }){
  if(!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md text-center">
        <h3 className="text-xl font-bold mb-2">Pedido enviado</h3>
        <p className="text-sm text-gray-700 mb-4">Tu pedido fue enviado. Por favor espera confirmación por parte del equipo de MAS CAMPO que se comunicará al número de WhatsApp proporcionado.</p>
        <button className="px-4 py-2 bg-gray-200 rounded" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
