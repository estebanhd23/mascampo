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

  const subtotal = useMemo(() => items.reduce((a, x) => a + x.subtotal, 0), [items]);
  const deliveryFee = useMemo(() => {
    if (deliveryPref?.modo !== "Te lo llevamos") return 0;
    return Number(deliveryPref?.fee || 0);
  }, [deliveryPref]);
  const total = subtotal + deliveryFee;
  const isBelowMOQ = useMemo(() => role === 'restaurant' && subtotal < MIN_ORDER_RESTAURANT, [role, subtotal]);
  
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const confirmFruverOrder = async (form) => {
    if (items.length === 0 || isBelowMOQ) return;
    try {
      setSaving(true);
      const order = {
        type: "fruver",
        items: items,
        subtotal, deliveryFee, total,
        entrega: { ...form, ...(deliveryPref || {}) },
        status: "Pendiente",
        createdAt: new Date().toISOString(),
        paymentMethod: form.metodoPago, 
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
      
      {/* ====== HEADER PREMIUM (PORTADA + PERFIL) ====== */}
      <div className="relative mb-16"> 
        <div className="w-full h-32 sm:h-48 bg-gray-200">
          <img src={portadaUrl} alt="Portada Fruver" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/10"></div>
        </div>

        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2 z-10">
          <div 
            onClick={() => navigate('/')} 
            className="w-24 h-24 sm:w-32 sm:h-32 rounded-[2rem] border-4 border-white shadow-xl overflow-hidden bg-white cursor-pointer hover:scale-105 transition-transform duration-300"
          >
            <img src={perfilUrl} alt="Logo Fruver" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 space-y-8">
        
{/* ====== INFO DE LA TIENDA (DISEÑO PREMIUM) ====== */}
<div className="max-w-7xl mx-auto px-6 pt-2 pb-8 text-center flex flex-col items-center">
  <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
    Más Campo • Mercado
  </h1>
  
  {/* ESTA ES LA FRANJA QUE PEDISTE (Estilo Rappi/UberEats) */}
  <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-500">
    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
      <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
      </svg>
      <span>4.9 Excelente</span>
    </div>
    
    <span className="hidden sm:block text-gray-300">•</span>
    
    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
      <span>🛵</span>
      <span>20 - 35 MIN</span>
    </div>

    <span className="hidden sm:block text-gray-300">•</span>

    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
      <span>📍</span>
      <span>Manizales</span>
    </div>
  </div>

  {/* BOTÓN DE ENTREGA (DINÁMICO) */}
  <div className="mt-6">
    <button
      onClick={() => setShowDeliveryModal(true)}
      className="text-xs font-bold px-5 py-2.5 rounded-xl bg-orange-50 text-orange-700 border border-orange-100 hover:bg-orange-100 transition-all shadow-sm"
    >
      {deliveryPref 
        ? `${deliveryPref.modo} · ${deliveryPref.barrioName || 'Manizales'} · Cambiar` 
        : "📍 Elegir entrega"}
    </button>
  </div>
</div>

        {/* BUSCADOR */}
        <div className="relative max-w-2xl mx-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en el mercado..."
            className="w-full border-none shadow-sm bg-white rounded-2xl pl-12 pr-10 py-4 outline-none focus:ring-2 focus:ring-orange-200 transition-all"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔎</span>
        </div>

        {/* CONTENIDO (TEMPORADA Y CATÁLOGO) */}
        {loadingMenu ? (
           <div className="text-center py-20 text-gray-400 animate-pulse font-medium">Cargando mercado...</div>
        ) : (
          <>
            {seasonal.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-xl font-bold flex items-center gap-2">🔥 Recomendados</h2>
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
              <h2 className="text-xl font-bold">Catálogo completo</h2>
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
          <div className="space-y-2 mb-6">
             <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>$ {fmt(subtotal)}</span></div>
             {isBelowMOQ && <p className="text-[10px] text-red-500 font-bold">Mínimo PRO: $ {fmt(MIN_ORDER_RESTAURANT)}</p>}
             <div className="flex justify-between text-gray-500"><span>Domicilio</span><span>$ {fmt(deliveryFee)}</span></div>
             <div className="flex justify-between text-xl font-black text-gray-900 border-t pt-2"><span>Total</span><span>$ {fmt(total)}</span></div>
          </div>
          <button
            onClick={() => setCheckoutOpen(true)}
            disabled={saving || items.length === 0 || isBelowMOQ}
            className="w-full py-4 rounded-2xl bg-orange-600 text-white font-bold hover:bg-orange-700 disabled:opacity-30 transition-all shadow-md shadow-orange-200"
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
          <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded-lg z-10">-{pct}%</span>
        )}
        <img src={prod.img || 'https://via.placeholder.com/200'} alt={prod.name} className="w-full h-full object-contain" />
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-gray-800 text-sm mb-1 truncate">{prod.name}</h3>
        <p className="text-gray-400 text-xs mb-3 font-medium uppercase">{prod.unit || 'Unidad'}</p>
        
        <div className="mb-4">
          <span className="text-lg font-black text-gray-900">$ {fmt(effPrice)}</span>
          {pct > 0 && role !== 'restaurant' && (
             <span className="text-xs text-gray-400 line-through ml-2">$ {fmt(basePrice)}</span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            <button onClick={() => dec(prod.id)} className="w-8 h-8 flex items-center justify-center font-bold text-gray-600 hover:text-black">–</button>
            <input 
              type="number" 
              value={q} 
              onChange={(e) => setQty(prod.id, e.target.value)}
              className="w-10 bg-transparent text-center text-sm font-bold outline-none" 
            />
            <button onClick={() => inc(prod.id)} className="w-8 h-8 flex items-center justify-center font-bold text-gray-600 hover:text-black">+</button>
          </div>
        </div>
      </div>
    </div>
  );
}