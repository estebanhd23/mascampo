// src/pages/Parfaits.jsx
import React, { useMemo, useState, useEffect } from "react";
import { usePedido } from "../context/PedidoContext";
import { useNavigate } from "react-router-dom";
import DeliveryPrefModal from "../components/DeliveryPrefModal";
import PagoModal from "../components/PagoModal";
import PedidoModal from "../components/PedidoModal";

export default function Parfaits() {
  const { menu, role, userDoc, addPedidoPendiente, cartParfaits, setCartParfaits } = usePedido();
  const navigate = useNavigate();

  const cover = menu?.settings?.storeImages?.coverParfait || 'https://images.unsplash.com/photo-1488477181946-6428a0291777?q=80&w=1200';
  const profile = menu?.settings?.storeImages?.profileParfait || 'https://images.unsplash.com/photo-1573511916317-567409292371?q=80&w=150';

  const baseParfait = (menu?.parfaits || []).find(p => p.active !== false);
  const [excludedFruits, setExcludedFruits] = useState([]);
  const fruitsData = menu?.parfaitFruits || [
  { id: 'f1', name: 'Fresa' },
  { id: 'f2', name: 'Banano' },
  { id: 'f3', name: 'Arándanos' },
  { id: 'f4', name: 'Mango' }
];

  const toggleFruit = (fruit) => {
    setExcludedFruits(prev => 
      prev.includes(fruit) ? prev.filter(f => f !== fruit) : [...prev, fruit]
    );
  };

  const yogurts = menu?.parfaitYogurts || [{ id: 'y1', name: 'Griego Natural' }];
  const granolas = menu?.parfaitGranolas || [{ id: 'g1', name: 'Granola Tradicional' }];

  const [selectedYogurt, setSelectedYogurt] = useState("");
  const [selectedGranola, setSelectedGranola] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [deliveryPref, setDeliveryPref] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("mc_delivery_pref_session_v1")); } catch { return null; }
  });
  const [showDeliveryModal, setShowDeliveryModal] = useState(!deliveryPref);

  useEffect(() => {
    if (yogurts.length > 0) setSelectedYogurt(yogurts[0].name);
    if (granolas.length > 0) setSelectedGranola(granolas[0].name);
  }, [menu]);

// Leemos el precio global que guardaste en la Intranet (con un valor por defecto por si acaso)
const basePrice = Number(menu?.parfaitBasePrice || 0); 
const discountPct = Number(menu?.settings?.discounts?.parfaits || 0);
const finalPrice = discountPct > 0 ? basePrice * (1 - discountPct / 100) : basePrice;

  const handleAddToCart = () => {
    const newItem = {
      ...baseParfait,
      id: baseParfait?.id || "custom-parfait",
      name: baseParfait?.name || "Parfait Personalizado",
      cartId: Date.now().toString(),
      yogurt: selectedYogurt,
      granola: selectedGranola,
      qty: itemQty,
      excludedFruits: excludedFruits,
      price: finalPrice,
      lineTotal: finalPrice * itemQty,
    };
    setCartParfaits([...(cartParfaits || []), newItem]);
    setExcludedFruits([]);
    setItemQty(1);
    alert("Producto añadido");
  };

  const removeCartItem = (cartId) => {
    setCartParfaits(cartParfaits.filter(item => item.cartId !== cartId));
  };

  const subtotal = (cartParfaits || []).reduce((acc, item) => acc + item.lineTotal, 0);
  const deliveryFee = deliveryPref?.modo === "Te lo llevamos" ? Number(deliveryPref?.fee || 0) : 0;
  const total = subtotal + deliveryFee;

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
const confirmOrder = async (form) => {
  try {
    const order = {
      type: "parfaits",
      // Mapeamos los items para asegurar que excludedFruits viaje bien
      items: (cartParfaits || []).map(it => ({
        id: it.id || "custom",
        name: it.name || "Parfait",
        qty: Number(it.qty) || 1,
        price: Number(it.price) || 0,
        lineTotal: Number(it.lineTotal) || 0,
        yogurt: it.yogurt || "",
        granola: it.granola || "",
        // IMPORTANTE: Aquí forzamos que sea un array de strings
        excludedFruits: Array.isArray(it.excludedFruits) ? [...it.excludedFruits] : []
      })),
      subtotal: Number(subtotal) || 0,
      deliveryFee: Number(deliveryFee) || 0,
      total: Number(total) || 0,
      entrega: { 
        ...form, 
        ...(deliveryPref || {}),
        telefono: form?.telefono || "" // Aseguramos el teléfono para WhatsApp
      },
      status: "Pendiente",
      createdAt: new Date().toISOString(),
      paymentMethod: form?.metodoPago || "Efectivo", 
    };

    // Limpieza de seguridad para evitar el error de 'undefined'
    const cleanOrder = JSON.parse(JSON.stringify(order));

    await addPedidoPendiente(cleanOrder);
    setCartParfaits([]);
    setCheckoutOpen(false);
    setConfirmOpen(true);
  } catch (e) { 
    console.error(e);
    alert("Error al procesar el pedido"); 
  }
};

  return (
    <div className="min-h-screen bg-white pb-32 font-sans text-gray-800">
      {/* BOTÓN VOLVER */}
      <button onClick={() => navigate('/')} className="absolute top-5 left-5 z-50 w-10 h-10 bg-white border border-gray-200 rounded-full shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7" /></svg>
      </button>

      {/* BANNER LIMPIO */}
      <div className="relative mb-16"> 
        <div className="w-full h-40 bg-gray-100 relative overflow-hidden">
          <img src={cover} className="w-full h-full object-cover grayscale-[20%]" alt="Banner" />
        </div>
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2 z-10">
          <div 
            onClick={() => navigate('/')} 
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-lg overflow-hidden bg-white cursor-pointer hover:scale-105 transition-transform duration-300"
            title="Volver al inicio"
          >
            <img src={profile} alt="Logo de la tienda" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* INFO TIENDA ESTILO RAPPI */}
      <div className="max-w-xl mx-auto px-6 text-center mb-10">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Personaliza tu Parfait</h1>
        <p className="mt-2 text-gray-500 text-[13px] font-light">
          Selecciona tus ingredientes favoritos para un parfait perfecto.
        </p>
      </div>

      <div className="max-w-xl mx-auto px-6 space-y-8">
        
        {/* SECCIÓN YOGURT */}
        <section>
          <h3 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">1. Frutas que incluye</h3>
          <h3 className="text-[12px] font-bold text-gray-900 uppercase tracking-widest mb-20 text-center mt-10"> Banano - Mango - Papaya - Kiwi - Fresa</h3>
          <div className="flex justify-between items-end mb-4 border-b border-gray-100 pb-2">
            
            <h3 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">2. Tipo de Yogurt</h3>
            <span className="text-[10px] text-gray-400 font-medium">Obligatorio</span>
          </div>
          <div className="space-y-2">
            {yogurts.map(y => (
              <button key={y.id} onClick={() => setSelectedYogurt(y.name)} className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border transition-all ${selectedYogurt === y.name ? 'border-green-500 bg-white shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                <span className={`text-[15px] ${selectedYogurt === y.name ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{y.name}</span>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedYogurt === y.name ? 'border-emerald-500 bg-green-500' : 'border-gray-300'}`}>
                  {selectedYogurt === y.name && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* SECCIÓN GRANOLA */}
        <section>
          <div className="flex justify-between items-end mb-4 border-b border-gray-100 pb-2">
            <h3 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">3. Granola</h3>
            <span className="text-[10px] text-gray-400 font-medium">Obligatorio</span>
          </div>
          <div className="space-y-2">
            {granolas.map(g => (
              <button key={g.id} onClick={() => setSelectedGranola(g.name)} className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border transition-all ${selectedGranola === g.name ? 'border-green-500 bg-white shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                <span className={`text-[15px] ${selectedGranola === g.name ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{g.name}</span>
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedGranola === g.name ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                  {selectedGranola === g.name && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* SECCIÓN FRUTAS (SOBRIO) */}
<div className="grid grid-cols-1 gap-3">
  <div className="flex justify-between items-end">
    <h3 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest ">4. ¿Deseas quitar alguna fruta?</h3>
    <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">Máx 2</span>
  </div>
  
  {fruitsData.map(fruitObj => {
    const fruitName = fruitObj.name; 
    const isSelected = excludedFruits.includes(fruitName);
    
    // 🌟 LÓGICA DE BLOQUEO: Se bloquea si ya hay 2 seleccionadas Y esta fruta NO es una de ellas.
    const isDisabled = excludedFruits.length >= 2 && !isSelected;

    return (
      <button 
        key={fruitObj.id} 
        onClick={() => toggleFruit(fruitName)} 
        disabled={isDisabled}
        className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all 
          ${isSelected 
            ? 'border-gray-900 bg-gray-900 text-white' 
            : isDisabled 
              ? 'border-gray-50 bg-gray-50 text-gray-300 opacity-60 cursor-not-allowed' // Estilo bloqueado
              : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200' // Estilo normal
          }`}
      >
        <span className="text-sm font-medium">{fruitName}</span>
        
        {isSelected ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <div className={`w-4 h-4 rounded border ${isDisabled ? 'border-gray-200 bg-gray-100' : 'border-gray-300'}`}></div>
        )}
      </button>
    );
  })}
</div>

        {/* AGREGAR AL CARRITO */}
        <div className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-50 rounded-xl border border-gray-100 h-14">
              <button onClick={() => setItemQty(Math.max(1, itemQty - 1))} className="w-12 h-full text-gray-400 hover:text-gray-900 text-xl font-light">－</button>
              <span className="w-8 text-center font-medium text-gray-900">{itemQty}</span>
              <button onClick={() => setItemQty(itemQty + 1)} className="w-12 h-full text-gray-400 hover:text-gray-900 text-xl font-light">＋</button>
            </div>
            <button onClick={handleAddToCart} disabled={!selectedYogurt || !selectedGranola} className="flex-1 h-14 rounded-xl bg-green-500 text-white font-bold text-[15px] shadow-sm hover:bg-green-400 disabled:opacity-30 disabled:grayscale transition-all flex justify-center items-center gap-2">
              Agregar $ {(itemQty * finalPrice).toLocaleString("es-CO")}
            </button>
          </div>
        </div>

        {/* LISTADO CARRITO ESTILO MINIMAL */}
        {cartParfaits?.length > 0 && (
          <div className="mt-12 pt-8 border-t border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-6">Tu Pedido</h3>
            <div className="space-y-6">
              {cartParfaits.map((item) => (
                <div key={item.cartId} className="flex justify-between items-start group">
                  <div className="space-y-1">
                    <p className="text-[15px] font-medium text-gray-900">{item.qty}x Parfait</p>
                    <p className="text-[12px] text-gray-400 font-light italic">
                      {item.yogurt} con {item.granola}
                      {item.excludedFruits?.length > 0 && ` • Sin: ${item.excludedFruits.join(", ")}`}
                    </p>
                    <button onClick={() => removeCartItem(item.cartId)} className="text-[11px] text-red-400 font-medium hover:text-red-600 transition-colors uppercase tracking-wider">Eliminar</button>
                  </div>
                  <p className="text-[15px] font-semibold text-gray-900">$ {item.lineTotal.toLocaleString("es-CO")}</p>
                </div>
              ))}

              <div className="bg-gray-50 rounded-2xl p-6 space-y-3 mt-8">
                <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>$ {subtotal.toLocaleString("es-CO")}</span></div>
                <div className="flex justify-between text-sm text-gray-500"><span>Envío</span><span>$ {deliveryFee.toLocaleString("es-CO")}</span></div>
                <div className="flex justify-between text-lg font-semibold text-gray-900 pt-3 border-t border-gray-200"><span>Total</span><span>$ {total.toLocaleString("es-CO")}</span></div>
                <button onClick={() => setCheckoutOpen(true)} className="w-full mt-4 py-4 rounded-xl bg-green-500 text-white font-bold text-base hover:bg-green-400 transition-all">
                  Continuar al pago
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <DeliveryPrefModal open={showDeliveryModal} onSubmit={(pref) => {setDeliveryPref(pref); setShowDeliveryModal(false)}} initialPref={deliveryPref || undefined} zones={menu?.barrios || []} />
      {checkoutOpen && <PagoModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} onConfirm={confirmOrder} total={total} role={role} userDoc={userDoc} />}
      {confirmOpen && <PedidoModal open={confirmOpen} onClose={() => setConfirmOpen(false)} />}
    </div>
  );
}