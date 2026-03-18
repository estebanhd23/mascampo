// src/pages/Parfaits.jsx
import React, { useState, useMemo } from "react";
import { usePedido } from "../context/PedidoContext";
import { useNavigate } from "react-router-dom";
import DeliveryPrefModal from "../components/DeliveryPrefModal";
import PagoModal from "../components/PagoModal";
import PedidoModal from "../components/PedidoModal";

export default function Parfaits() {
  const { menu, role, userDoc, addPedidoPendiente } = usePedido();
  const navigate = useNavigate();
  const [qty, setQty] = useState({});

  // Imágenes desde settings
  const cover = menu?.settings?.storeImages?.coverParfait || 'https://images.unsplash.com/photo-1488477181946-6428a0291777?q=80&w=1200';
  const profile = menu?.settings?.storeImages?.profileParfait || 'https://images.unsplash.com/photo-1573511916317-567409292371?q=80&w=150';

  const parfaits = (menu?.parfaits || []).filter(p => p.active !== false);

  const cartItems = useMemo(() => {
    return parfaits.filter(p => qty[p.id] > 0).map(p => ({
      ...p,
      qty: qty[p.id],
      lineTotal: qty[p.id] * (role === 'restaurant' ? (p.price_b2b || p.price) : p.price)
    }));
  }, [qty, parfaits, role]);

  const subtotal = cartItems.reduce((acc, item) => acc + item.lineTotal, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* HEADER */}
      <div className="relative mb-16">
        <div className="w-full h-32 sm:h-48 bg-purple-100">
          <img src={cover} className="w-full h-full object-cover" alt="Portada" />
        </div>
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2">
          <div onClick={() => navigate('/')} className="w-24 h-24 sm:w-32 sm:h-32 rounded-[2rem] border-4 border-white shadow-xl overflow-hidden bg-white cursor-pointer hover:scale-105 transition-all">
            <img src={profile} className="w-full h-full object-cover" alt="Perfil" />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 text-center space-y-4">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Más Campo • Parfaits</h1>
        <p className="text-gray-500 text-sm">Yogurt griego artesanal, frutas frescas y toppings premium.</p>
      </div>

      {/* GRILLA */}
      <div className="max-w-5xl mx-auto px-6 mt-12 grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
        {parfaits.map(p => (
          <div key={p.id} className="bg-white rounded-[2.5rem] border border-gray-100 p-4 shadow-sm flex flex-col items-center text-center">
            <div className="w-full aspect-square bg-purple-50 rounded-2xl overflow-hidden mb-4 p-2">
              <img src={p.img || 'https://via.placeholder.com/200'} className="w-full h-full object-contain" alt={p.name} />
            </div>
            <h3 className="font-bold text-gray-800 mb-1 truncate w-full">{p.name}</h3>
            <p className="text-purple-600 font-black mb-4">$ {(role === 'restaurant' ? (p.price_b2b || p.price) : p.price).toLocaleString("es-CO")}</p>
            
            <div className="flex items-center bg-gray-50 rounded-xl p-1 w-full justify-between">
              <button onClick={() => setQty({...qty, [p.id]: Math.max(0, (qty[p.id] || 0) - 1)})} className="w-8 h-8 font-bold text-gray-400">-</button>
              <span className="font-bold text-sm">{qty[p.id] || 0}</span>
              <button onClick={() => setQty({...qty, [p.id]: (qty[p.id] || 0) + 1})} className="w-8 h-8 font-bold text-gray-400">+</button>
            </div>
          </div>
        ))}
      </div>

      {/* BARRA FLOTANTE CARRITO */}
      {subtotal > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-md bg-gray-900 text-white p-4 rounded-3xl shadow-2xl flex items-center justify-between z-50">
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-bold">Total Parfaits</p>
            <p className="text-xl font-black text-purple-400">$ {subtotal.toLocaleString("es-CO")}</p>
          </div>
          <button className="bg-purple-600 px-6 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-purple-500/30">
            Ir a pagar
          </button>
        </div>
      )}
    </div>
  );
}