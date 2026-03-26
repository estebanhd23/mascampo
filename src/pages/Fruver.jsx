// src/pages/Fruver.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { usePedido } from "../context/PedidoContext"; 
import { useNavigate } from "react-router-dom"; // 🛑 Añadimos navigate para el logo
import DeliveryPrefModal from "../components/DeliveryPrefModal";
import PagoModal from "../components/PagoModal";
import PedidoModal from "../components/PedidoModal";

// 🛑 CONSTANTE DE COMPRA MÍNIMA
const MIN_ORDER_RESTAURANT = 30000; 

function fmt(n) {
  return (Number(n) || 0).toLocaleString("es-CO");
}

export default function Fruver() {
  const { menu, addPedidoPendiente, role, userDoc, loadingMenu } = usePedido(); 
  const navigate = useNavigate();

  // ====== IMÁGENES DE PORTADA Y PERFIL (Específicas de Fruver) ======
  const coverFruver = menu?.settings?.storeImages?.coverFruver;
  const profileFruver = menu?.settings?.storeImages?.profileFruver;

  const portadaUrl = (coverFruver && coverFruver.trim() !== '') 
    ? coverFruver 
    : 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200';

  const perfilUrl = (profileFruver && profileFruver.trim() !== '') 
    ? profileFruver 
    : 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?q=80&w=150';

  // ======================
  // Preferencia de entrega
  // ======================
  const DELIVERY_SESSION_KEY = "mc_delivery_pref_session_v1";
  const deliveryZones = (menu?.barrios && Array.isArray(menu.barrios) ? menu.barrios : menu?.settings?.deliveryZones) || [];

  const [deliveryPref, setDeliveryPref] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DELIVERY_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [showDeliveryModal, setShowDeliveryModal] = useState(!deliveryPref);

  const handleDeliveryPrefSubmit = (pref) => {
    let out = { ...pref };
    if (pref?.modo === "Te lo llevamos") {
      const z = (deliveryZones || []).find((z) => z.id === pref.barrioId) || (deliveryZones || []).find((z) => z.name === pref.barrioName);
      if (z) out = { ...out, barrioId: z.id, barrioName: z.name, fee: Number(z.fee || 0) };
    }
    setDeliveryPref(out);
    try { sessionStorage.setItem(DELIVERY_SESSION_KEY, JSON.stringify(out)); } catch {}
    setShowDeliveryModal(false);
  };

  const catalog = (menu?.fruver || []).filter((p) => p?.active !== false);
  const seasonalIDs = useMemo(() => (Array.isArray(menu?.settings?.fruverSeasonal) ? menu.settings.fruverSeasonal : []), [menu?.settings?.fruverSeasonal]);

  const seasonal = useMemo(() => {
    const set = new Set((seasonalIDs || []).map(String));
    return catalog.filter((p) => set.has(String(p.id)));
  }, [catalog, seasonalIDs]);

  const viewportRef = useRef(null);
  const [cardW, setCardW] = useState(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const rem = 16;
      const gap = 0.75 * rem;
      const isLg = window.matchMedia("(min-width:1024px)").matches;
      const cols = isLg ? 4 : 3;
      const w = (rect.width - gap * (cols - 1)) / cols;
      setCardW(w);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fruverDiscounts = (menu?.settings?.discounts?.fruver && typeof menu.settings.discounts.fruver === "object") ? menu.settings.discounts.fruver : {};
  const [q, setQ] = useState("");
  const isDiscountQuery = (term) => /(descuent|ofert|promo)/i.test(term);

  const visibleCatalog = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return catalog;
    if (isDiscountQuery(term)) return catalog.filter((p) => Number(fruverDiscounts[p.id] || 0) > 0);
    return catalog.filter((p) => (p.name || "").toLowerCase().includes(term));
  }, [catalog, q, fruverDiscounts]);

  const [qty, setQty] = useState({});
  const setQtyClamped = (id, next) => {
    let v = Math.max(0, Math.round(Number(next) || 0));
    setQty((prev) => ({ ...prev, [id]: v }));
  };
  const inc = (id) => setQty((p) => ({ ...p, [id]: (Number(p[id]) || 0) + 1 }));
  const dec = (id) => setQty((p) => ({ ...p, [id]: Math.max(0, (Number(p[id]) || 0) - 1) }));

  const items = useMemo(() => {
    return catalog.filter((it) => (qty[it.id] || 0) > 0).map((it) => {
      const q = Number(qty[it.id] || 0);
      const price = Number(it.price || 0); 
      const pct = Number(fruverDiscounts[it.id] || 0);
      const effPrice = role === 'restaurant' ? price : price * (1 - pct / 100);
      const line = q * effPrice;
      return { id: it.id, name: it.name, unit: it.unit || "unidad", price: effPrice, qty: q, subtotal: line, lineTotal: line, img: it.img || "" };
    });
  }, [catalog, qty, fruverDiscounts, role]); 

 // ====== 1. SUBTOTAL Y DOMICILIO ======
  const subtotal = useMemo(() => items.reduce((a, x) => a + x.subtotal, 0), [items]);
  const deliveryFee = useMemo(() => {
    if (deliveryPref?.modo !== "Te lo llevamos") return 0;
    return Number(deliveryPref?.fee || 0);
  }, [deliveryPref]);

  // ====== 2. CÓDIGO PROMOCIONAL (Se calcula antes del Total) ======
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);

  const applyPromo = () => {
    const codeUpper = promoInput.trim().toUpperCase();
    const validCodes = menu?.settings?.promoCodes || [];
    const found = validCodes.find(c => c.code === codeUpper && c.active !== false);

    if (found) {
      if (subtotal >= (found.minAmount || 0)) {
        setAppliedPromo({ code: found.code, discountPct: found.discount, minAmount: found.minAmount || 0 });
        alert(`¡Código aplicado! ${found.discount}% de descuento.`);
      } else {
        alert(`Este código requiere un pedido mínimo de $${(found.minAmount || 0).toLocaleString("es-CO")}`);
      }
    } else {
      alert("Código inválido, inactivo o expirado.");
      setAppliedPromo(null);
    }
  };

  const discountAmount = (appliedPromo && subtotal >= appliedPromo.minAmount) 
    ? (subtotal * (appliedPromo.discountPct / 100)) 
    : 0;

  // ====== 3. TOTAL FINAL ======
  const total = subtotal - discountAmount + deliveryFee;
  const isBelowMOQ = useMemo(() => role === 'restaurant' && subtotal < MIN_ORDER_RESTAURANT, [role, subtotal]);
  
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const confirmFruverOrder = async (form) => {
    if (items.length === 0 || isBelowMOQ) return;
    try {
      setSaving(true);
    const order = {
  type: "fruver", // Agregamos el tipo para que la Intranet sepa cómo mostrarlo
  items: items.map(it => ({
    id: String(it.id || ''),
    name: String(it.name || ''),
    qty: Number(it.qty || 0),
    price: Number(it.price || 0),
    lineTotal: Number(it.lineTotal || 0),
    unit: String(it.unit || '')
  })),
  // Forzamos conversión a número para evitar errores en Firestore
  subtotal: Number(subtotal || 0), 
  deliveryFee: Number(deliveryFee || 0), 
  total: Number(total || 0),
  entrega: { 
    ...form, 
    ...(deliveryPref || {}),
    barrio: form.barrio || deliveryPref?.barrio || "No especificado"
  },
  status: "Pendiente",
  createdAt: new Date().toISOString(),
  paymentMethod: form.metodoPago || "No especificado", 
  pricing: { 
    promoCode: String(appliedPromo?.code || ""), 
    promoDiscount: Number(discountAmount || 0) 
  },
};
      await addPedidoPendiente(order);
      setQty({});
      setCheckoutOpen(false);
      setConfirmOpen(true);
    } catch (e) { alert("Error al guardar pedido"); } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .mc-swipe { scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; }
        .mc-snap-start { scroll-snap-align: start; }
      `}</style>
      {/* BOTÓN FLOTANTE ATRÁS */}
<button
  onClick={() => navigate('/')}
  className="absolute top-4 left-4 sm:top-6 sm:left-6 z-50 w-10 h-10 sm:w-12 sm:h-12 bg-white/90 backdrop-blur-md border border-white/50 rounded-full shadow-lg flex items-center justify-center text-gray-800 hover:bg-white hover:scale-105 transition-all active:scale-95"
  aria-label="Volver al inicio"
>
  <svg className="w-5 h-5 sm:w-6 sm:h-6 pr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
</button>
      {/* ====== HEADER PREMIUM (PORTADA + PERFIL) ====== */}
      <div className="relative mb-16"> 
        <div className="w-full h-32 sm:h-48 bg-gray-200">
          <img src={portadaUrl} alt="Portada Fruver" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/10"></div>
        </div>

        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2 z-10">
          <div 
            onClick={() => navigate('/')} 
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-lg overflow-hidden bg-white cursor-pointer hover:scale-105 transition-transform duration-300"
            title="Volver al inicio"
          >
            <img src={perfilUrl} alt="Logo de la tienda" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 space-y-8">
        
{/* ====== INFO DE LA TIENDA (DISEÑO PREMIUM) ====== */}
{/* 👇 INFO DE LA TIENDA (Estilo Minimalista Rappi) */}
<div className="max-w-7xl mx-auto px-6 pt-8 pb-10 text-center flex flex-col items-center border-b border-gray-100 mb-8">
  
  {/* Nombre con tipografía elegante y no tan "pesada" */}
  <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Mercado</h1>
  
  {/* Línea de Meta-información (Estilo Pill de Rappi) */}
  <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-[13px] text-gray-500">
    
    {/* Calificación */}
    <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-gray-50 rounded-lg transition-colors">
      <svg className="w-3.5 h-3.5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className="font-semibold text-gray-700">4.9</span>
      <span className="text-gray-400">(120+)</span>
    </div>

    <span className="w-1 h-1 bg-gray-300 rounded-full hidden sm:inline" />

    {/* Tiempo de entrega (Sin emoji, solo texto y gris) */}
    <div className="py-1 px-2">
      <span className="text-gray-400 mr-1 font-light">Entrega en</span>
      <span className="font-medium text-gray-700">
        {deliveryPref?.eta ? `${deliveryPref.eta} min` : "20-35 min"}
      </span>
    </div>

    <span className="w-1 h-1 bg-gray-300 rounded-full hidden sm:inline" />

    {/* Costo de Envío / Selección de Barrio */}
    <button 
      onClick={() => setShowDeliveryModal(true)}
      className="flex items-center gap-1.5 py-1 px-2 text-blue-500 font-medium hover:underline decoration-blue-200 underline-offset-4"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      {deliveryPref?.modo === "Lo recojo" 
        ? "Recoger en tienda" 
        : deliveryPref?.barrioName 
          ? `Envío $${deliveryFee.toLocaleString("es-CO")}`
          : "Seleccionar entrega"}
    </button>
  </div>

  {/* Descripción en gris suave y letra ligera */}
  <p className="mt-5 text-gray-400 text-[13px] max-w-sm font-light leading-relaxed">
    Bowls saludables e ingredientes frescos directo a tu mesa en Manizales.
  </p>
</div>

        {/* BUSCADOR */}
        <div className="relative max-w-2xl mx-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en el mercado..."
            className="w-full border-none shadow-sm bg-white rounded-2xl pl-12 pr-10 py-4 outline-none focus:ring-2 focus:ring-orange-200 transition-all"
          />
        </div>

        {/* CONTENIDO (TEMPORADA Y CATÁLOGO) */}
        {loadingMenu ? (
           <div className="text-center py-20 text-gray-400 animate-pulse font-medium">Cargando mercado...</div>
        ) : (
          <>
            {seasonal.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-xl font-semi-bold flex items-center gap-2">Recomendados</h2>
                <div ref={viewportRef} className="overflow-x-auto scrollbar-hide mc-swipe">
                  <div className="flex gap-4 pb-4">
                    {seasonal.map((prod) => (
                      <div key={prod.id} className="shrink-0 mc-snap-start" style={{ width: cardW ? `${cardW}px` : '280px' }}>
                         <FruverItem prod={prod} qty={qty[prod.id]} inc={inc} dec={dec} setQty={setQtyClamped} role={role} discount={fruverDiscounts[prod.id]} />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section className="space-y-4">
              <h2 className="text-xl font-semi-bold">Catálogo completo</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {visibleCatalog.map((prod) => (
                  <FruverItem key={prod.id} prod={prod} qty={qty[prod.id]} inc={inc} dec={dec} setQty={setQtyClamped} role={role} discount={fruverDiscounts[prod.id]} />
                ))}
              </div>
            </section>
          </>
        )}

       {/* RESUMEN FLOTANTE O FINAL */}
        <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 max-w-md ml-auto">
          
          {/* CÓDIGO PROMOCIONAL */}
          <div className="flex gap-2 mb-6">
            <input 
              type="text" 
              placeholder="Código Promo" 
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm uppercase outline-none focus:border-orange-400"
            />
            <button onClick={applyPromo} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black">
              Aplicar
            </button>
          </div>

          {/* DESGLOSE DEL COBRO */}
          <div className="space-y-2 mb-6">
             <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>$ {fmt(subtotal)}</span></div>
             {isBelowMOQ && <p className="text-[10px] text-red-500 font-bold">Mínimo PRO: $ {fmt(MIN_ORDER_RESTAURANT)}</p>}
             
             {/* Muestra el descuento si existe */}
             {appliedPromo && discountAmount > 0 && (
               <div className="flex justify-between text-emerald-600 font-bold text-sm">
                 <span>Desc. ({appliedPromo.code})</span>
                 <span>-$ {fmt(discountAmount)}</span>
               </div>
             )}

             <div className="flex justify-between text-gray-500"><span>Domicilio</span><span>$ {fmt(deliveryFee)}</span></div>
             <div className="flex justify-between text-xl font-semi-bold text-gray-900 border-t pt-2 mt-2"><span>Total</span><span>$ {fmt(total)}</span></div>
          </div>
          
          <button
            onClick={() =>
              setCheckoutOpen(true)}
           
            disabled={saving || items.length === 0 || isBelowMOQ}
            className="w-full py-4 rounded-2xl bg-green-500 text-white font-bold hover:bg-green-400  transition-all shadow-md"
          >
            {saving ? "Procesando..." : "Confirmar Pedido"}
          </button>
        </section>
      </div>

      <DeliveryPrefModal open={showDeliveryModal} onSubmit={handleDeliveryPrefSubmit} initialPref={deliveryPref || undefined} zones={deliveryZones} />
      {checkoutOpen && <PagoModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} onConfirm={confirmFruverOrder} total={total} role={role} userDoc={userDoc} />}
      {confirmOpen && <PedidoModal open={confirmOpen} onClose={() => setConfirmOpen(false)} />}
    </div>
  );
}

// COMPONENTE INTERNO PARA CADA ITEM
function FruverItem({ prod, qty, inc, dec, setQty, role, discount }) {
  const q = Number(qty || 0);
  const pct = Number(discount || 0);
  const basePrice = Number(prod.price || 0);
  const effPrice = role === 'restaurant' ? basePrice : basePrice * (1 - pct / 100);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
      <div className="aspect-square bg-gray-50 p-4 relative">
        {pct > 0 && role !== 'restaurant' && (
          <span className="absolute top-2 right-2 bg-yellow-500 text-white text-[10px] font-black px-2 py-1 rounded-lg z-10">-{pct}%</span>
        )}
        <img src={prod.img || 'https://via.placeholder.com/200'} alt={prod.name} className="w-full h-full object-contain" />
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-gray-800 text-sm mb-1 truncate">{prod.name}</h3>
        <p className="text-gray-400 text-xs mb-3 font-medium uppercase">{prod.unit || 'Unidad'}</p>
        
        <div className="mb-4">
          <span className="text-lg font-semi-bold text-gray-900">$ {fmt(effPrice)}</span>
          {pct > 0 && role !== 'restaurant' && (
             <span className="text-xs text-gray-400 line-through ml-2">$ {fmt(basePrice)}</span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            <button onClick={() => dec(prod.id)} className="w-8 h-8 flex items-center justify-center font-semi-bold text-gray-600 hover:text-black">–</button>
            <input 
              type="number" 
              value={q} 
              onChange={(e) => setQty(prod.id, e.target.value)}
              className="w-10 bg-transparent text-center text-sm font-semi-bold outline-none" 
            />
            <button onClick={() => inc(prod.id)} className="w-8 h-8 flex items-center justify-center font-semi-bold text-gray-600 hover:text-black">+</button>
          </div>
        </div>
      </div>
    </div>
  );
}