
import React from 'react';
export default function PedidoResumen({ cart, current, currentPrice }){
  const total = (cart?.reduce((a,c)=>a+(c.price||0),0) || 0) + (current? currentPrice:0);
  return (
    <div>
      <h4 className="font-semibold mb-2">Resumen</h4>
      <div className="text-sm text-gray-600 mb-2">Bowls en pedido: {cart.length + (current?1:0)}</div>
      <div className="font-bold text-lg">Total: ${total.toLocaleString()}</div>
      <div className="mt-2 text-xs text-gray-500">El total se actualiza automáticamente a medida que eliges ingredientes.</div>
    </div>
  );
}
