// src/pages/Intranet.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePedido } from "../context/PedidoContext";
import FruverBulkPricesLite from "../components/FruverBulkPricesLite.jsx";
import { Link } from "react-router-dom";
import { db, auth } from "../firebase.js"; 



import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  Timestamp
} from "firebase/firestore";



/* =========================
   Zona horaria: America/Bogota
   ========================= */
const BOGOTA_TZ = "America/Bogota";

 // Usuario que estamos creando/editando// helpers de fecha/hora en Bogotá
function getBogotaParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = Number(get("hour") || 0);
  const minute = Number(get("minute") || 0);
  const wraw = (get("weekday") || "").toLowerCase(); // ej: "lun."
  // normalizamos "mié."/"sáb." -> "mie"/"sab"
  const wkeyMap = { lun: "mon", mar: "tue", mie: "wed", jue: "thu", vie: "fri", sab: "sat", dom: "sun" };
  const wnorm = wraw.normalize("NFD").replace(/[\u0300-\u036f.]/g, "").slice(0, 3);
  const dayKey = wkeyMap[wnorm] || "mon";
  return { hour, minute, dayKey };
}
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const prevDay = (key) => DAY_ORDER[(DAY_ORDER.indexOf(key) + 6) % 7];


// convierte "HH:MM" a minutos del día
const hmToMin = (s) => {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mi = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return h * 60 + mi;
};



// ¿abierto por horario? (incluye rangos que cruzan medianoche)
function isOpenBySchedule(schedule = {}, d = new Date()) {
  const { hour, minute, dayKey } = getBogotaParts(d);
  const now = hour * 60 + minute;

  const today = schedule[dayKey] || {};
  const yKey = prevDay(dayKey);
  const yesterday = schedule[yKey] || {};

  const tOpen = hmToMin(today.open);
  const tClose = hmToMin(today.close);
  const yOpen = hmToMin(yesterday.open);
  const yClose = hmToMin(yesterday.close);

  // día cerrado explícitamente
  if (today.closed === true) {
    // pero si AYER cruzaba medianoche y aún no llegamos al cierre de hoy, seguimos abiertos
    if (yOpen != null && yClose != null && yOpen > yClose && now < (yClose ?? 0) && yesterday.closed !== true) {
      return true;
    }
    return false;
  }

  if (tOpen == null || tClose == null) return false;

  // rango normal (no cruza medianoche)
  if (tOpen < tClose) {
    return now >= tOpen && now < tClose;
  }
  // rango que cruza medianoche (ej: 20:00 -> 02:00)
  if (tOpen > tClose) {
    return now >= tOpen || now < tClose;
  }
  // open == close -> considerado cerrado
  return false;
}

// Única definición de fmtDateTimeBogota
function fmtDateTimeBogota(value) {
  try {
    let d;
    if (value && typeof value.toDate === "function") d = value.toDate(); // Firestore Timestamp
    else if (typeof value === "string") d = new Date(value);
    else if (value instanceof Date) d = value;
    else return "—";

    return new Intl.DateTimeFormat("es-CO", {
      timeZone: BOGOTA_TZ,
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString("es-CO");
}

/* =========================
   Helpers
   ========================= */
function normalizeIntlPhone(s = "") {
  // 1) sólo dígitos
  let digits = String(s).replace(/[^\d]/g, "");

  // 2) quita ceros iniciales frecuentes
  while (digits.startsWith("0")) digits = digits.slice(1);

  // 3) si ya viene 57 + 10 dígitos → OK
  if (digits.startsWith("57") && digits.length === 12) return digits;

  // 4) celular colombiano (10 dígitos y empieza por 3) → anteponer 57
  if (digits.length === 10 && digits.startsWith("3")) return "57" + digits;

  // 5) si trae más de 12 con 57, recorta a 12
  if (digits.startsWith("57") && digits.length > 12) return digits.slice(0, 12);

  // 6) fallback: si tiene 9–11 dígitos, toma los últimos 10 y antepone 57
  if (digits.length >= 9 && digits.length <= 11 && !digits.startsWith("57")) {
    return "57" + digits.slice(-10);
  }

  return digits;
}

function nameById(list = [], id = "") {
  return list.find((x) => x.id === id)?.name || id;
}

function formatQtyMapAsNames(qtyMap = {}, catalog = []) {
  const entries = Object.entries(qtyMap);
  if (entries.length === 0) return "—";
  return entries.map(([id, qty]) => `${nameById(catalog, id)} x${qty}`).join(", ");
}
function formatKeysAsNames(keysMap = {}, catalog = []) {
  const keys = Object.keys(keysMap || {});
  if (keys.length === 0) return "—";
  return keys.map((id) => nameById(catalog, id)).join(", ");
}

function slugify(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function splitLinesOrCommas(text = "") {
  return String(text)
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* =========================
   WhatsApp helpers + templates (ACTUALIZADAS)
   ========================= */
function buildItemsBlock(order, menu) {
  const items = order?.items || [];

  // === FRUVER: ya trae nombres ===
  if (order?.type === "fruver") {
    return items
      .map(
        (it, idx) =>
          `#${idx + 1} ${it.name} · ${it.qty} ${it.unit === "lb" ? "lb" : "u."}  —  $ ${(Number(it.lineTotal) || 0).toLocaleString("es-CO")}`
      )
      .join("\n");
  }



  // === BOWLS: resolver nombres desde menu si no vienen en el pedido ===
  const bowls     = Array.isArray(menu?.bowls) ? menu.bowls : [];
  const prote     = Array.isArray(menu?.proteinas) ? menu.proteinas : [];
  const topps     = Array.isArray(menu?.toppings)  ? menu.toppings  : [];
  const salsas    = Array.isArray(menu?.salsas)    ? menu.salsas    : [];
  const bebidas   = Array.isArray(menu?.bebidas)   ? menu.bebidas   : [];
  const combo250  = Array.isArray(menu?.combo?.bebidas250) ? menu.combo.bebidas250 : [];
  const comboSnks = Array.isArray(menu?.combo?.snacks) ? menu.combo.snacks : [];

  const nameById = (list = [], id = "", fb = "") =>
    list.find((x) => String(x.id) === String(id))?.name || fb || String(id || "");

  const formatQtyMapAsNames = (qtyMap = {}, catalog = []) => {
    const entries = Object.entries(qtyMap || {});
    if (entries.length === 0) return "—";
    return entries
      .filter(([, q]) => Number(q) > 0)
      .map(([id, q]) => `${nameById(catalog, id)} x${q}`)
      .join(", ");
  };

  const formatKeysAsNames = (keysMap = {}, catalog = []) => {
    const keys = Object.keys(keysMap || {});
    if (keys.length === 0) return "—";
    return keys.map((id) => nameById(catalog, id)).join(", ");
  };

  return items
    .map((it, idx) => {
      const bowlName = it?.bowlName || nameById(bowls, it?.bowlId, "Bowl");
      const prot     = formatQtyMapAsNames(it?.proteinas, prote);
      const tops     = formatQtyMapAsNames(it?.toppings,  topps);
      const sals     = formatKeysAsNames(it?.salsas,      salsas);

      const bebidaSuelta = it?.bebidaId ? nameById(bebidas, it.bebidaId, "Bebida") : "";
      const comboBebi    = it?.comboBebidaId ? nameById(combo250, it.comboBebidaId, "250 ml") : "";
      const comboSnack   = it?.comboSnackId  ? nameById(comboSnks, it.comboSnackId, "") : "";

      const comboLinea = it?.combo
        ? `🥤 + Combo (${comboBebi || "250 ml"}${comboSnack ? ` · Snack: ${comboSnack}` : ""})`
        : (bebidaSuelta ? `🥤 ${bebidaSuelta}` : "");

      return [
        `#${idx + 1} ${bowlName}`,
        `🍗 ${prot}`,
        `🥗 ${tops}`,
        `🧂 ${sals}`,
        comboLinea
      ].filter(Boolean).join("\n");
    })
    .join("\n------------------------\n");
}

function renderTemplate(tpl, order, menu) {
  const fmtMoney = (n) => (Number(n) || 0).toLocaleString("es-CO");

  const nombre     = order?.entrega?.nombre   || "";
  const telefono   = order?.entrega?.telefono || "";
  const direccion  = order?.entrega?.direccion|| "";
  const metodoPago = order?.entrega?.metodoPago || "—";
  const modo       = order?.entrega?.modo     || "—";
  const enMinutos  = order?.entrega?.eta      || "";
  const total      = fmtMoney(order?.total || 0);
  const itemsBlock = buildItemsBlock(order, menu); // <<<<<< usa menu aquí

  return (tpl || "")
    .replace(/{{orderId}}/g, order?.id || "—")
    .replace(/{{nombre}}/g, nombre)
    .replace(/{{telefono}}/g, telefono)
    .replace(/{{direccion}}/g, direccion)
    .replace(/{{metodoPago}}/g, metodoPago)
    .replace(/{{modo}}/g, modo)
    .replace(/{{enMinutos}}/g, String(enMinutos))
    .replace(/{{total}}/g, total)
    .replace(/{{items}}/g, itemsBlock);
}

function buildWhatsAppLink({ toPhoneIntl, message }) {
  const phone = String(toPhoneIntl || "").replace(/[^\d]/g, "");
  // Asegura composición estándar de unicode (emojis y acentos)
  const text = String(message || "").normalize("NFC");
  // Usa la API clásica (acepta emojis perfecto)
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;
}

const DEFAULT_TEMPLATES = {
  newOrder:
    `🍃 *Mas Campo*\n` +
    `🧾 Pedido #{{orderId}}\n` +
    `👤 {{nombre}}  📞 {{telefono}}\n` +
    `📍 {{direccion}}\n` +
    `🧭 Modo: *{{modo}}*\n` +
    `💳 Pago: *{{metodoPago}}*\n` +
    `------------------------\n` +
    `{{items}}\n` +
    `------------------------\n` +
    `💰 Total: *$ {{total}}*\n\n` +
    `Por favor responde *✅ Confirmo mi pedido*. ¡Gracias! 🙌`,
  outForDelivery:
    `🍃 *Mas Campo*\n` +
    `🧾 Pedido #{{orderId}}\n` +
    `🚗 Tu pedido está *en camino*.\n` +
    `⏱️ Llegará en aprox. {{enMinutos}} min.\n` +
    `¡Gracias por tu compra! 🙌`,
  readyForPickup:
    `🍃 *Mas Campo*\n` +
    `🧾 Pedido #{{orderId}}\n` +
    `✅ Tu pedido está *listo para recoger*.\n` +
    `¡Te esperamos! 🙌`,
  fruverNewOrder:
    `🍃 *Mas Campo* — *Fruver*\n` +
    `🧾 Pedido #{{orderId}}\n` +
    `👤 {{nombre}}  📞 {{telefono}}\n` +
    `📍 {{direccion}}\n` +
    `🧭 Modo: *{{modo}}*\n` +
    `💳 Pago: *{{metodoPago}}*\n` +
    `------------------------\n` +
    `{{items}}\n` +
    `------------------------\n` +
    `💰 Total: *$ {{total}}*\n\n` +
    `Por favor responde *✅ Confirmo mi pedido*. ¡Gracias! 🥦🍎`,
};

/* ============== Modal simple ============== */
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded hover:bg-gray-100"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ====== defaults de horarios ====== */
const DEFAULT_STORE_HOURS = {
  mon: { open: "08:00", close: "20:00", closed: false },
  tue: { open: "08:00", close: "20:00", closed: false },
  wed: { open: "08:00", close: "20:00", closed: false },
  thu: { open: "08:00", close: "20:00", closed: false },
  fri: { open: "08:00", close: "20:00", closed: false },
  sat: { open: "08:00", close: "20:00", closed: false },
  sun: { open: "08:00", close: "20:00", closed: true  },
};

// ——— Acordeón “card” reutilizable ———
// ——— Acordeón “card” reutilizable ———
// ==========================================
// NUEVO COMPONENTE: EditorHorarios (Pégalo ARRIBA)
// ==========================================
function EditorHorarios({ 
  storeHours, 
  setStoreHours, 
  saveStoreHours, 
  setManualOverride 
}) {
  const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DAY_ORDER.map((d) => (
          <div key={d} className="border rounded-lg p-3">
            <div className="font-medium capitalize mb-2">
              {({ mon:"Lunes", tue:"Martes", wed:"Miércoles", thu:"Jueves", fri:"Viernes", sat:"Sábado", sun:"Domingo" })[d]}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">Apertura</label>
              <input
                type="time"
                className="border rounded p-1"
                value={storeHours[d]?.open || "08:00"}
                disabled={storeHours[d]?.closed}
                onChange={(e) =>
                  setStoreHours((s) => ({ ...s, [d]: { ...(s[d] || {}), open: e.target.value } }))
                }
              />
              <label className="text-sm">Cierre</label>
              <input
                type="time"
                className="border rounded p-1"
                value={storeHours[d]?.close || "20:00"}
                disabled={storeHours[d]?.closed}
                onChange={(e) =>
                  setStoreHours((s) => ({ ...s, [d]: { ...(s[d] || {}), close: e.target.value } }))
                }
              />
              <label className="ml-2 text-sm flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={!!storeHours[d]?.closed}
                  onChange={(e) =>
                    setStoreHours((s) => ({ ...s, [d]: { ...(s[d] || {}), closed: e.target.checked } }))
                  }
                />
                Cerrado
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Si el cierre es menor que la apertura (ej. 20:00 → 02:00), se asume que cruza medianoche.
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
        <button
          onClick={saveStoreHours}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
        >
          Guardar horario
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600 mr-2">Control manual:</span>
          <button
            onClick={() => setManualOverride("open")}
            className="px-3 py-2 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50"
          >
            Abrir ahora
          </button>
          <button
            onClick={() => setManualOverride("closed")}
            className="px-3 py-2 rounded-lg border border-red-600 text-red-700 hover:bg-red-50"
          >
            Cerrar ahora
          </button>
          <button
            onClick={() => setManualOverride(null)}
            className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Volver a automático
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorStoreImages
// ==========================================
function EditorStoreImages({ menu, setMenu }) {
  // 1. Usamos un estado local para que el input sea fluido al escribir/pegar
  const [localImages, setLocalImages] = React.useState(menu?.settings?.storeImages || {});

  // Actualizar el estado local mientras escribes
  const handleLocalChange = (campo, valor) => {
    setLocalImages(prev => ({ ...prev, [campo]: valor }));
  };

  // 2. Función para guardar definitivamente en el menú global y Firebase
  const saveImages = async () => {
    try {
      const nextMenu = {
        ...(menu || {}),
        settings: {
          ...(menu?.settings || {}),
          storeImages: localImages
        }
      };
      await setMenu(nextMenu);
      alert("¡Imágenes de las secciones actualizadas! ✅");
    } catch (error) {
      alert("Error al guardar las imágenes.");
    }
  };

  return (
    <div className="space-y-8">
      {/* SECCIÓN GASTRO (BOWLS) */}
      <div className="border border-emerald-100 bg-emerald-50/30 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5 border-b border-emerald-100 pb-3">
          <span className="text-3xl">🥗</span>
          <h3 className="text-xl font-bold text-emerald-900">Sección Bowls</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">URL Portada Gastro</label>
            <input 
              className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-emerald-400 outline-none bg-white" 
              value={localImages.coverGastro || ''} 
              onChange={(e) => handleLocalChange('coverGastro', e.target.value)} 
              placeholder="https://link-de-la-imagen.jpg"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">URL Perfil Gastro</label>
            <input 
              className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-emerald-400 outline-none bg-white" 
              value={localImages.profileGastro || ''} 
              onChange={(e) => handleLocalChange('profileGastro', e.target.value)} 
              placeholder="https://link-de-la-imagen.jpg"
            />
          </div>
        </div>
      </div>

      {/* SECCIÓN FRUVER */}
      <div className="border border-orange-100 bg-orange-50/30 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5 border-b border-orange-100 pb-3">
          <span className="text-3xl">🍎</span>
          <h3 className="text-xl font-bold text-orange-900">Sección Fruver</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">URL Portada Fruver</label>
            <input 
              className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-orange-400 outline-none bg-white" 
              value={localImages.coverFruver || ''} 
              onChange={(e) => handleLocalChange('coverFruver', e.target.value)} 
              placeholder="https://link-de-la-imagen.jpg"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">URL Perfil Fruver</label>
            <input 
              className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-orange-400 outline-none bg-white" 
              value={localImages.profileFruver || ''} 
              onChange={(e) => handleLocalChange('profileFruver', e.target.value)} 
              placeholder="https://link-de-la-imagen.jpg"
            />
          </div>
        </div>
      </div>

      {/* SECCIÓN PARFAITS */}
      <div className="border border-purple-100 bg-purple-50/30 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5 border-b border-purple-100 pb-3">
          <span className="text-3xl">🍨</span>
          <h3 className="text-xl font-bold text-purple-900">Sección Parfaits</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">URL Portada Parfaits</label>
            <input 
              className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-purple-400 outline-none bg-white" 
              value={localImages.coverParfait || ''} 
              onChange={(e) => handleLocalChange('coverParfait', e.target.value)} 
              placeholder="https://link-de-la-imagen.jpg"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">URL Perfil Parfaits</label>
            <input 
              className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-purple-400 outline-none bg-white" 
              value={localImages.profileParfait || ''} 
              onChange={(e) => handleLocalChange('profileParfait', e.target.value)} 
              placeholder="https://link-de-la-imagen.jpg"
            />
          </div>
        </div>
      </div>

      {/* BOTÓN DE GUARDADO GLOBAL */}
      <div className="flex justify-center pt-4">
        <button 
          onClick={saveImages}
          className="bg-gray-900 text-white font-black px-10 py-4 rounded-2xl hover:bg-black shadow-xl transition-all transform hover:scale-105 active:scale-95"
        >
          GUARDAR TODOS LOS CAMBIOS
        </button>
      </div>
    </div>
  );
}


// ==========================================
// NUEVO COMPONENTE: ListaPedidos
// ==========================================
function ListaPedidos({ pedidosPendientes, pedidosHistorico, PedidoCard }) {
  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-h">
          <h2 className="text-lg font-semibold">Pendientes</h2>
          <span className="text-sm text-gray-500">{pedidosPendientes.length} pedido(s)</span>
        </div>
        <div className="p-4">
          {pedidosPendientes.length === 0 ? (
            <div className="text-sm text-gray-500">No hay pedidos pendientes.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {pedidosPendientes.map((p) => (
                <PedidoCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2 className="text-lg font-semibold">Histórico</h2>
          <span className="text-sm text-gray-500">{pedidosHistorico.length} pedido(s)</span>
        </div>
        <div className="p-4">
          {pedidosHistorico.length === 0 ? (
            <div className="text-sm text-gray-500">Aún no hay pedidos completados.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {pedidosHistorico.map((p) => (
                <PedidoCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ==========================================
// NUEVO COMPONENTE: EditorParfaits
// ==========================================
function EditorParfaits({ menu, setMenu }) {
  // Estos estados ahora viven aquí, ¡bórralos de tu Intranet si los tenías allá!
  const [formParfait, setFormParfait] = React.useState({ name: '', price: '', price_b2b: '', img: '', description: '' });
  const [editingParfaitId, setEditingParfaitId] = React.useState(null);


  const saveOpcionesExtra = () => {
    const yList = document.getElementById('input-yogurts').value.split(',').map(n => n.trim()).filter(n => n);
    const gList = document.getElementById('input-granolas').value.split(',').map(n => n.trim()).filter(n => n);
    
    const next = { ...menu };
    next.parfaitYogurts = yList.map((name, i) => ({ id: `y${i}`, name }));
    next.parfaitGranolas = gList.map((name, i) => ({ id: `g${i}`, name }));
    setMenu(next);
    alert("¡Opciones actualizadas!");
  };

  return (
    <div className="space-y-6">

      {/* OPCIONES DE PERSONALIZACIÓN */}
      <div className="mt-8 p-6 bg-white border border-gray-200 rounded-[2rem] shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4 text-lg">⚙️ Opciones de Personalización</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2">Tipos de Yogurt (Separados por coma)</label>
            <textarea id="input-yogurts" className="w-full border border-gray-200 p-3 rounded-xl text-sm outline-none bg-gray-50 focus:ring-2 focus:ring-purple-200" rows="3" placeholder="Ej: Griego Natural, Griego Fresa" defaultValue={(menu?.parfaitYogurts || []).map(y => y.name).join(', ')} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2">Tipos de Granola (Separados por coma)</label>
            <textarea id="input-granolas" className="w-full border border-gray-200 p-3 rounded-xl text-sm outline-none bg-gray-50 focus:ring-2 focus:ring-purple-200" rows="3" placeholder="Ej: Tradicional, Sin Azúcar" defaultValue={(menu?.parfaitGranolas || []).map(g => g.name).join(', ')} />
          </div>
        </div>
        <div className="mt-4 text-right">
          <button 
            onClick={saveOpcionesExtra} 
            className="px-6 py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all shadow-md"
          >
            Guardar Opciones
          </button>
        </div>
      </div>
    </div>
  );
}


// ==========================================
// NUEVO COMPONENTE: EditorIdentidad
// ==========================================
function EditorIdentidad({ menu, setMenu }) {
  // Inicializamos el estado aquí adentro (BÓRRALOS DE LA INTRANET)
  const initialIdentity = React.useMemo(() => ({
    logoUrl: menu?.logoUrl || "",
    logoSize: menu?.settings?.logoSize || 80,
    footerLogoUrl: menu?.footerLogoUrl || "",
    heroUrl: menu?.heroUrl || "",
    tagline: menu?.tagline || "",
    bgColor: menu?.settings?.bgColor || "#f9f8f1",
    primaryColor: menu?.settings?.primaryColor || "#10624c",
  }), [menu?.logoUrl, menu?.footerLogoUrl, menu?.heroUrl, menu?.tagline, menu?.settings?.bgColor, menu?.settings?.primaryColor]);

  const [identityCfg, setIdentityCfg] = React.useState(initialIdentity);

  React.useEffect(() => {
    setIdentityCfg(initialIdentity);
  }, [initialIdentity]);

  const saveIdentity = async () => {
    const next = {
      ...(menu || {}),
      logoUrl: identityCfg.logoUrl,
      footerLogoUrl: identityCfg.footerLogoUrl,
      heroUrl: identityCfg.heroUrl,
      tagline: identityCfg.tagline,
      settings: {
        ...(menu?.settings || {}),
        bgColor: identityCfg.bgColor,
        primaryColor: identityCfg.primaryColor,
        logoSize: Number(identityCfg.logoSize),
      },
    };
    await setMenu(next);
    alert("Identidad y portada guardadas ✅");
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Configura los elementos visuales principales del sitio: logotipos, imagen de portada, lema y colores.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Logo Principal (Limpio y sin duplicados) */}
        <div>
          <label className="block text-xs text-gray-600 mb-1">Logo principal (header)</label>
          <input
            className="w-full border p-2 rounded-lg mb-2"
            value={identityCfg.logoUrl}
            onChange={(e) => setIdentityCfg(prev => ({ ...prev, logoUrl: e.target.value }))}
            placeholder="https://..."
          />
          
          {/* Controles de Tamaño */}
          <div className="flex items-center gap-3 mb-2 bg-gray-50 p-2 rounded-lg border">
            <span className="text-xs text-gray-500">Tamaño:</span>
            <button 
              onClick={() => setIdentityCfg(prev => ({...prev, logoSize: Math.max(20, (prev.logoSize || 80) - 10)}))}
              className="w-8 h-8 bg-white border rounded hover:bg-gray-100 font-bold text-gray-600"
              title="Reducir"
            >
              -
            </button>
            <input 
              type="range" 
              min="20" 
              max="300" 
              value={identityCfg.logoSize || 80}
              onChange={(e) => setIdentityCfg(prev => ({...prev, logoSize: Number(e.target.value)}))}
              className="flex-1 cursor-pointer"
            />
            <button 
              onClick={() => setIdentityCfg(prev => ({...prev, logoSize: Math.min(300, (prev.logoSize || 80) + 10)}))}
              className="w-8 h-8 bg-white border rounded hover:bg-gray-100 font-bold text-gray-600"
              title="Aumentar"
            >
              +
            </button>
            <span className="text-xs font-mono w-12 text-right">{identityCfg.logoSize || 80}px</span>
          </div>

          {/* Previsualización en tiempo real */}
          {identityCfg.logoUrl && (
            <div className="mt-2 border p-4 rounded bg-gray-100 flex justify-center items-center">
              <img 
                src={identityCfg.logoUrl} 
                alt="logo" 
                style={{ height: `${identityCfg.logoSize || 80}px`, objectFit: 'contain' }} 
              />
            </div>
          )}
        </div>

        {/* Logo Footer */}
        <div>
          <label className="block text-xs text-gray-600 mb-1">Logo pie de página (footer)</label>
          <input
            className="w-full border p-2 rounded-lg"
            value={identityCfg.footerLogoUrl}
            onChange={(e) => setIdentityCfg(prev => ({ ...prev, footerLogoUrl: e.target.value }))}
            placeholder="https://..."
          />
          {identityCfg.footerLogoUrl && (
            <div className="mt-2">
              <img src={identityCfg.footerLogoUrl} alt="footer logo" className="h-12 object-contain" />
            </div>
          )}
        </div>
      </div>

      {/* Tagline */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">Lema o tagline</label>
        <input
          className="w-full border p-2 rounded-lg"
          value={identityCfg.tagline}
          onChange={(e) => setIdentityCfg(prev => ({ ...prev, tagline: e.target.value }))}
          placeholder="Ej: Más Campo en la ciudad 🌿"
        />
      </div>

      {/* Colores */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Color de fondo</label>
          <input
            type="color"
            className="w-full border rounded-lg h-10 cursor-pointer p-1"
            value={identityCfg.bgColor}
            onChange={(e) => setIdentityCfg(prev => ({ ...prev, bgColor: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Color primario</label>
          <input
            type="color"
            className="w-full border rounded-lg h-10 cursor-pointer p-1"
            value={identityCfg.primaryColor}
            onChange={(e) => setIdentityCfg(prev => ({ ...prev, primaryColor: e.target.value }))}
          />
        </div>
      </div>

      {/* Botón Guardar */}
      <div className="text-right">
        <button
          onClick={saveIdentity}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
        >
          Guardar identidad
        </button>
      </div>
    </div>
  );
}


// ==========================================
// NUEVO COMPONENTE: EditorBarrios
// ==========================================
function EditorBarrios({ menu, setMenu, slugify }) {
  // Inicializamos y declaramos el estado correctamente
  const initialBarrios = Array.isArray(menu?.barrios) ? menu.barrios : [];
  const [barrios, setBarrios] = React.useState(initialBarrios);

  React.useEffect(() => {
    setBarrios(Array.isArray(menu?.barrios) ? menu.barrios : []);
  }, [menu?.barrios]);

  const addBarrio = () => {
    const id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    setBarrios(p => [...p, { id, name: "Nuevo barrio", fee: 0 }]);
  };

  const updBarrio = (idx, patch) => {
    setBarrios(p => {
      const next = [...p];
      next[idx] = { ...(next[idx] || {}), ...patch };
      return next;
    });
  };

  const delBarrio = (id) => setBarrios(p => p.filter(b => b.id !== id));

  const saveBarrios = async () => {
    const cleaned = (barrios || []).map(b => ({
      id: b.id || slugify(b.name || "barrio"),
      name: String(b.name || "").trim(),
      fee: Number(b.fee || 0) || 0,
    }));
    const next = { ...(menu || {}), barrios: cleaned };
    await setMenu(next);
    alert("Barrios guardados ✅");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Define los barrios y el costo de domicilio asociado.</p>

      <div className="flex justify-end">
        <button onClick={addBarrio} className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
          + Agregar barrio
        </button>
      </div>

      {(!barrios || barrios.length === 0) ? (
        <div className="text-sm text-gray-500">Aún no hay barrios. Agrega uno para comenzar.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {barrios.map((b, idx) => (
            <div key={b.id || idx} className="border rounded-lg p-3 space-y-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                <input
                  className="w-full border p-2 rounded-lg"
                  value={b.name ?? ""}
                  onChange={(e) => updBarrio(idx, { name: e.target.value })}
                  placeholder="Barrio"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">ID</label>
                  <input
                    className="w-full border p-2 rounded-lg font-mono text-xs"
                    value={b.id ?? ""}
                    onChange={(e) => updBarrio(idx, { id: slugify(e.target.value) })}
                    placeholder="id-barrio"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Fee domicilio</label>
                  <input
                    type="number"
                    className="w-full border p-2 rounded-lg"
                    value={Number(b.fee || 0)}
                    onChange={(e) => updBarrio(idx, { fee: Number(e.target.value || 0) })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <small className="text-gray-500 break-all">{b.id}</small>
                <button
                  type="button"
                  className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                  onClick={() => delBarrio(b.id)}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-right">
        <button onClick={saveBarrios} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
          Guardar barrios
        </button>
      </div>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorBowls
// ==========================================
function EditorBowls({ menu, setMenu, slugify }) {
  // Inicializamos el estado correctamente
  const initialBowls = Array.isArray(menu?.bowls) ? menu.bowls : [];
  const [bowls, setBowls] = React.useState(initialBowls);

  React.useEffect(() => {
    setBowls(Array.isArray(menu?.bowls) ? menu.bowls : []);
  }, [menu?.bowls]);

  const addBowl = () => {
    const id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    setBowls(p => [...p, {
      id,
      name: "Nuevo bowl",
      precio: 0,
      proteinasIncluidas: 1,
      toppingsIncluidos: 3,
      img: "",
    }]);
  };

  const updBowl = (idx, patch) => {
    setBowls(p => {
      const next = [...p];
      next[idx] = { ...(next[idx] || {}), ...patch };
      return next;
    });
  };

  const delBowl = (id) => setBowls(p => p.filter(b => b.id !== id));

  const saveBowls = async () => {
    const cleaned = (bowls || []).map(b => ({
      id: b.id || slugify(b.name || "bowl"),
      name: String(b.name || "").trim(),
      precio: Number(b.precio || 0) || 0,
      proteinasIncluidas: Math.max(0, Number(b.proteinasIncluidas || 0) || 0),
      toppingsIncluidos: Math.max(0, Number(b.toppingsIncluidos || 0) || 0),
      img: String(b.img || ""),
    }));
    const next = { ...(menu || {}), bowls: cleaned };
    await setMenu(next);
    alert("Bowls guardados ✅");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={addBowl} className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
          + Agregar bowl
        </button>
      </div>

      {(!bowls || bowls.length === 0) ? (
        <div className="text-sm text-gray-500">Aún no hay bowls. Agrega uno para comenzar.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {bowls.map((b, idx) => (
            <div key={b.id || idx} className="border rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="w-full aspect-video bg-gray-100 overflow-hidden">
                {b.img ? <img src={b.img} alt={b.name} className="w-full h-full object-cover" /> : null}
              </div>
              <div className="p-3 space-y-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={b.name ?? ""}
                    onChange={(e) => updBowl(idx, { name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="md:col-span-1">
                    <label className="block text-xs text-gray-600 mb-1">Precio</label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded-lg"
                      value={Number(b.precio || 0)}
                      onChange={(e) => updBowl(idx, { precio: Number(e.target.value || 0) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Prot. incl.</label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded-lg"
                      value={Number(b.proteinasIncluidas || 0)}
                      onChange={(e) => updBowl(idx, { proteinasIncluidas: Number(e.target.value || 0) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Top. incl.</label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded-lg"
                      value={Number(b.toppingsIncluidos || 0)}
                      onChange={(e) => updBowl(idx, { toppingsIncluidos: Number(e.target.value || 0) })}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs text-gray-600 mb-1">ID</label>
                    <input
                      className="w-full border p-2 rounded-lg font-mono text-xs"
                      value={b.id ?? ""}
                      onChange={(e) => updBowl(idx, { id: slugify(e.target.value) })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={b.img ?? ""}
                    onChange={(e) => updBowl(idx, { img: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <small className="text-gray-500 break-all">{b.id}</small>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    onClick={() => delBowl(b.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-right">
        <button onClick={saveBowls} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
          Guardar bowls
        </button>
      </div>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorProteinas
// ==========================================
function EditorProteinas({ menu, setMenu, slugify }) {
  const initialProteinas = Array.isArray(menu?.proteinas) ? menu.proteinas : [];
  const [prote, setProte] = React.useState(initialProteinas);

  React.useEffect(() => {
    setProte(Array.isArray(menu?.proteinas) ? menu.proteinas : []);
  }, [menu?.proteinas]);

  const add = () => {
    const id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    setProte(p => [...p, { id, name: "Nueva proteína", extraPrice: 5500, img: "" }]);
  };

  const upd = (idx, patch) => {
    setProte(p => {
      const next = [...p];
      next[idx] = { ...(next[idx] || {}), ...patch };
      return next;
    });
  };

  const del = (id) => setProte(p => p.filter(x => x.id !== id));

  const save = async () => {
    const cleaned = (prote || []).map(x => ({
      id: x.id || slugify(x.name || "protein"),
      name: String(x.name || "").trim(),
      extraPrice: Number(x.extraPrice || 0) || 0,
      img: String(x.img || ""),
    }));
    const next = { ...(menu || {}), proteinas: cleaned };
    await setMenu(next);
    alert("Proteínas guardadas ✅");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        El <b>extraPrice</b> es el valor por proteína extra (el cliente puede pasar del límite del bowl).
      </p>

      <div className="flex justify-end">
        <button onClick={add} className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
          + Agregar proteína
        </button>
      </div>

      {(!prote || prote.length === 0) ? (
        <div className="text-sm text-gray-500">Aún no hay proteínas. Agrega una para comenzar.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {prote.map((it, idx) => (
            <div key={it.id || idx} className="border rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="p-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={it.name ?? ""}
                    onChange={(e) => upd(idx, { name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                  <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 shrink-0 bg-gray-100 rounded border border-gray-200 overflow-hidden flex items-center justify-center">
                      {it.img ? (
                        <img src={it.img} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-gray-400">Sin foto</span>
                      )}
                    </div>
                    <input
                      className="w-full border p-2 rounded-lg outline-none"
                      placeholder="https://..."
                      value={it.img || ""}
                      onChange={(e) => upd(idx, { img: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Extra Price</label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded-lg"
                      value={Number(it.extraPrice || 0)}
                      onChange={(e) => upd(idx, { extraPrice: Number(e.target.value || 0) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">ID</label>
                    <input
                      className="w-full border p-2 rounded-lg font-mono text-xs"
                      value={it.id ?? ""}
                      onChange={(e) => upd(idx, { id: slugify(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <small className="text-gray-500 break-all">{it.id}</small>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    onClick={() => del(it.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-right">
        <button onClick={save} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
          Guardar proteínas
        </button>
      </div>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorToppings
// ==========================================
function EditorToppings({ menu, setMenu, slugify }) {
  const initialTops = Array.isArray(menu?.toppings) ? menu.toppings : [];
  const [tops, setTops] = React.useState(initialTops);

  React.useEffect(() => {
    setTops(Array.isArray(menu?.toppings) ? menu.toppings : []);
  }, [menu?.toppings]);

  const add = () => {
    const id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    setTops(p => [...p, { id, name: "Nuevo topping", extraPrice: 3000, img: "" }]);
  };

  const upd = (idx, patch) => {
    setTops(p => {
      const next = [...p];
      next[idx] = { ...(next[idx] || {}), ...patch };
      return next;
    });
  };

  const del = (id) => setTops(p => p.filter(x => x.id !== id));

  const save = async () => {
    const cleaned = (tops || []).map(x => ({
      id: x.id || slugify(x.name || "topping"),
      name: String(x.name || "").trim(),
      extraPrice: Number(x.extraPrice || 0) || 0,
      img: String(x.img || ""),
    }));
    const next = { ...(menu || {}), toppings: cleaned };
    await setMenu(next);
    alert("Toppings guardados ✅");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        El <b>extraPrice</b> se cobra cuando el cliente supera el número de toppings incluidos en el bowl.
      </p>

      <div className="flex justify-end">
        <button onClick={add} className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
          + Agregar topping
        </button>
      </div>

      {(!tops || tops.length === 0) ? (
        <div className="text-sm text-gray-500">Aún no hay toppings. Agrega uno para comenzar.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {tops.map((it, idx) => (
            <div key={it.id || idx} className="border rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="p-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={it.name ?? ""}
                    onChange={(e) => upd(idx, { name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                  <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 shrink-0 bg-gray-100 rounded border border-gray-200 overflow-hidden flex items-center justify-center">
                      {it.img ? (
                        <img src={it.img} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-gray-400">Sin foto</span>
                      )}
                    </div>
                    <input
                      className="w-full border p-2 rounded-lg outline-none"
                      placeholder="https://..."
                      value={it.img || ""}
                      onChange={(e) => upd(idx, { img: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Extra Price</label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded-lg"
                      value={Number(it.extraPrice || 0)}
                      onChange={(e) => upd(idx, { extraPrice: Number(e.target.value || 0) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">ID</label>
                    <input
                      className="w-full border p-2 rounded-lg font-mono text-xs"
                      value={it.id ?? ""}
                      onChange={(e) => upd(idx, { id: slugify(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <small className="text-gray-500 break-all">{it.id}</small>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    onClick={() => del(it.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-right">
        <button onClick={save} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
          Guardar toppings
        </button>
      </div>
    </div>
  );
}


// ==========================================
// NUEVO COMPONENTE: EditorSalsas
// ==========================================
function EditorSalsas({ menu, setMenu, slugify }) {
  const initialSalsas = Array.isArray(menu?.salsas) ? menu.salsas : [];
  const [salsas, setSalsas] = React.useState(initialSalsas);

  React.useEffect(() => {
    setSalsas(Array.isArray(menu?.salsas) ? menu.salsas : []);
  }, [menu?.salsas]);

  const add = () => {
    const id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    setSalsas(p => [...p, { id, name: "Nueva salsa", img: "" }]);
  };

  const upd = (idx, patch) => {
    setSalsas(p => {
      const next = [...p];
      next[idx] = { ...(next[idx] || {}), ...patch };
      return next;
    });
  };

  const del = (id) => setSalsas(p => p.filter(x => x.id !== id));

  const save = async () => {
    const cleaned = (salsas || []).map(x => ({
      id: x.id || slugify(x.name || "salsa"),
      name: String(x.name || "").trim(),
      img: String(x.img || ""),
    }));
    const next = { ...(menu || {}), salsas: cleaned };
    await setMenu(next);
    alert("Salsas guardadas ✅");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Agrega las opciones de salsas. El cliente puede elegir varias sin costo extra.
      </p>

      <div className="flex justify-end">
        <button onClick={add} className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
          + Agregar salsa
        </button>
      </div>

      {(!salsas || salsas.length === 0) ? (
        <div className="text-sm text-gray-500">Aún no hay salsas. Agrega una para comenzar.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {salsas.map((it, idx) => (
            <div key={it.id || idx} className="border rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="p-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={it.name ?? ""}
                    onChange={(e) => upd(idx, { name: e.target.value })}
                  />
                </div>

                {/* FOTO CON VISTA PREVIA */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                  <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 shrink-0 bg-gray-100 rounded border border-gray-200 overflow-hidden flex items-center justify-center">
                      {it.img ? (
                        <img src={it.img} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-gray-400">Sin foto</span>
                      )}
                    </div>
                    <input
                      className="w-full border p-2 rounded-lg outline-none"
                      placeholder="https://..."
                      value={it.img || ""}
                      onChange={(e) => upd(idx, { img: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">ID</label>
                  <input
                    className="w-full border p-2 rounded-lg font-mono text-xs"
                    value={it.id ?? ""}
                    onChange={(e) => upd(idx, { id: slugify(e.target.value) })}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <small className="text-gray-500 break-all">{it.id}</small>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    onClick={() => del(it.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-right">
        <button onClick={save} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
          Guardar salsas
        </button>
      </div>
    </div>
  );
}


// ==========================================
// NUEVO COMPONENTE: EditorBebidas
// ==========================================
function EditorBebidas({ menu, setMenu, slugify }) {
  const initialBebidas = Array.isArray(menu?.bebidas) ? menu.bebidas : [];
  const [bebidas, setBebidas] = React.useState(initialBebidas);

  React.useEffect(() => {
    setBebidas(Array.isArray(menu?.bebidas) ? menu.bebidas : []);
  }, [menu?.bebidas]);

  const add = () => {
    const id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    setBebidas(p => [...p, { id, name: "Nueva bebida", precio: 0, img: "" }]);
  };

  const upd = (idx, patch) => {
    setBebidas(p => {
      const next = [...p];
      next[idx] = { ...(next[idx] || {}), ...patch };
      return next;
    });
  };

  const del = (id) => setBebidas(p => p.filter(x => x.id !== id));

  const save = async () => {
    const cleaned = (bebidas || []).map(x => ({
      id: x.id || slugify(x.name || "bebida"),
      name: String(x.name || "").trim(),
      precio: Number(x.precio || 0) || 0,
      img: String(x.img || ""),
    }));
    const next = { ...(menu || {}), bebidas: cleaned };
    await setMenu(next);
    alert("Bebidas guardadas ✅");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={add} className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
          + Agregar bebida
        </button>
      </div>

      {(!bebidas || bebidas.length === 0) ? (
        <div className="text-sm text-gray-500">Aún no hay bebidas. Agrega una para comenzar.</div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto pr-2 pb-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {bebidas.map((it, idx) => (
            <div key={it.id || idx} className="border rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="w-full aspect-video bg-gray-100 overflow-hidden">
                {it.img ? <img src={it.img} alt={it.name} className="w-full h-full object-cover" /> : null}
              </div>
              <div className="p-3 space-y-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={it.name ?? ""}
                    onChange={(e) => upd(idx, { name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Precio</label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded-lg"
                      value={Number(it.precio || 0)}
                      onChange={(e) => upd(idx, { precio: Number(e.target.value || 0) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">ID</label>
                    <input
                      className="w-full border p-2 rounded-lg font-mono text-xs"
                      value={it.id ?? ""}
                      onChange={(e) => upd(idx, { id: slugify(e.target.value) })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                  <input
                    className="w-full border p-2 rounded-lg"
                    value={it.img ?? ""}
                    onChange={(e) => upd(idx, { img: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <small className="text-gray-500 break-all">{it.id}</small>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    onClick={() => del(it.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
      )}

      <div className="text-right">
        <button onClick={save} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
          Guardar bebidas
        </button>
      </div>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorHomeSplit
// ==========================================
function EditorHomeSplit({ menu, setMenu }) {
  // Estados locales para las URLs
  const [localUrls, setLocalUrls] = React.useState({
    heroUrl: menu?.heroUrl || "",
    heroFruverUrl: menu?.heroFruverUrl || "",
    heroParfaitUrl: menu?.heroParfaitUrl || ""
  });

  // Estado local para la opacidad
  const [opacityValue, setOpacityValue] = React.useState(
    Math.max(0, Math.min(1, Number(menu?.settings?.homeOverlayOpacity ?? 0.4)))
  );

  // Sincronizar al cargar la página
  React.useEffect(() => {
    setLocalUrls({
      heroUrl: menu?.heroUrl || "",
      heroFruverUrl: menu?.heroFruverUrl || "",
      heroParfaitUrl: menu?.heroParfaitUrl || ""
    });
    setOpacityValue(Math.max(0, Math.min(1, Number(menu?.settings?.homeOverlayOpacity ?? 0.4))));
  }, [menu?.heroUrl, menu?.heroFruverUrl, menu?.heroParfaitUrl, menu?.settings?.homeOverlayOpacity]);

  // Actualizar solo la pantalla al escribir
  const handleUrlChange = (field, value) => {
    setLocalUrls(prev => ({ ...prev, [field]: value }));
  };

  // 🌟 NUEVO: Función real que envía todo a Firebase al hacer clic
  const handleSave = async () => {
    const nextMenu = {
      ...menu,
      heroUrl: localUrls.heroUrl,
      heroFruverUrl: localUrls.heroFruverUrl,
      heroParfaitUrl: localUrls.heroParfaitUrl,
      settings: {
        ...(menu?.settings || {}),
        homeOverlayOpacity: opacityValue
      }
    };
    
    await setMenu(nextMenu);
    alert("¡Imágenes de inicio guardadas correctamente! ✅");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Bowls */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Imagen — Bowls (URL)</label>
          <input 
            className="w-full border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-200" 
            value={localUrls.heroUrl} 
            onChange={(e) => handleUrlChange('heroUrl', e.target.value)} 
          />
          {localUrls.heroUrl && (
            <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 h-32 bg-gray-50 shadow-sm">
              <img src={localUrls.heroUrl} alt="Bowls" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Fruver */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Imagen — Fruver (URL)</label>
          <input 
            className="w-full border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-200" 
            value={localUrls.heroFruverUrl} 
            onChange={(e) => handleUrlChange('heroFruverUrl', e.target.value)} 
          />
          {localUrls.heroFruverUrl && (
            <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 h-32 bg-gray-50 shadow-sm">
              <img src={localUrls.heroFruverUrl} alt="Fruver" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Parfaits */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Imagen — Parfaits (URL)</label>
          <input 
            className="w-full border border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-purple-200" 
            value={localUrls.heroParfaitUrl} 
            onChange={(e) => handleUrlChange('heroParfaitUrl', e.target.value)} 
          />
          {localUrls.heroParfaitUrl && (
            <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 h-32 bg-gray-50 shadow-sm">
              <img src={localUrls.heroParfaitUrl} alt="Parfaits" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      </div>

      {/* Opacidad y Botón de Guardar */}
      <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 flex flex-col md:flex-row gap-6 items-center">
        <div className="flex-1 w-full">
          <label className="block text-sm font-bold text-gray-700 mb-2">Opacidad del overlay oscuro (0 a 1)</label>
          <div className="flex items-center gap-4">
            <input 
              type="range" 
              min={0} max={1} step={0.05} 
              value={opacityValue} 
              onChange={(e) => setOpacityValue(Number(e.target.value))} 
              className="w-full accent-gray-900" 
            />
            <input 
              type="number" 
              min={0} max={1} step={0.05} 
              className="w-24 border border-gray-200 p-2 rounded-xl font-bold text-center outline-none" 
              value={opacityValue} 
              onChange={(e) => setOpacityValue(Number(e.target.value))} 
            />
          </div>
        </div>
        <div className="text-right shrink-0">
          {/* 🌟 Botón REAL de Guardar */}
          <button 
            onClick={handleSave}
            className="px-6 py-3 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-md border hover:bg-black transition-all active:scale-95"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorPromos
// ==========================================
function EditorPromos({ menu, setMenu, db }) {
  // Inicializamos y declaramos los estados aquí adentro (BÓRRALOS DE LA INTRANET)
  const initialDiscounts = React.useMemo(() => ({
    bowls: menu?.settings?.discounts?.bowls || {},
    fruver: menu?.settings?.discounts?.fruver || {},
    parfaits: menu?.settings?.discounts?.parfaits || {} 
  }), [menu?.settings?.discounts]);

  const [discounts, setDiscounts] = React.useState(initialDiscounts);

  React.useEffect(() => {
    setDiscounts((prev) => {
      const a = JSON.stringify(prev);
      const b = JSON.stringify(initialDiscounts);
      return a === b ? prev : initialDiscounts;
    });
  }, [initialDiscounts]);

  const [promoType, setPromoType] = React.useState("bowls");
  const [promoProductId, setPromoProductId] = React.useState("");
  const [promoPercent, setPromoPercent] = React.useState(10);

  const bowlsList = Array.isArray(menu?.bowls) ? menu.bowls : [];
  const fruverList = Array.isArray(menu?.fruver) ? menu.fruver : [];
  const parfaitList = Array.isArray(menu?.parfaits) ? menu.parfaits : [];

  const upsertPromo = () => {
    if (!promoProductId) { alert("Elige un producto o la opción 'Todos'"); return; }
    const pct = Math.max(0, Math.min(100, Number(promoPercent) || 0));
    setDiscounts((d) => {
      const next = { bowls: { ...d.bowls }, fruver: { ...d.fruver }, parfaits: { ...d.parfaits } };
      if (promoProductId === "TODOS") {
        const list = promoType === "bowls" ? bowlsList : promoType === "parfaits" ? parfaitList : fruverList;
        list.forEach(item => {
           if (pct > 0) next[promoType][item.id] = pct;
           else delete next[promoType][item.id];
        });
      } else {
        if (pct > 0) next[promoType][promoProductId] = pct;
        else delete next[promoType][promoProductId];
      }
      return next;
    });
    alert(promoProductId === "TODOS" ? `Descuento del ${pct}% a todos los ${promoType} en borrador.` : "Promo en borrador.");
  };

  const removePromo = (type, id) => {
    setDiscounts((d) => {
      const next = { bowls: { ...d.bowls }, fruver: { ...d.fruver }, parfaits: { ...d.parfaits } };
      if (next[type]) delete next[type][id];
      return next;
    });
  };

const saveDiscounts = async () => {
  try {
    // Función de limpieza para asegurar que solo guardamos números válidos entre 0 y 100
    const cleanMap = (obj = {}) => {
      if (!obj) return {};
      return Object.fromEntries(
        Object.entries(obj)
          .map(([id, v]) => [String(id || "").trim(), Math.max(0, Math.min(100, Number(v) || 0))])
          .filter(([_, v]) => v > 0)
      );
    };

    const cleaned = {
      bowls: cleanMap(discounts?.bowls),
      fruver: cleanMap(discounts?.fruver),
      parfaits: cleanMap(discounts?.parfaits),
    };

    // Referencia al documento en Firestore
    const menuRef = doc(db, "menu", "config");

    // Guardamos en la base de datos
    await updateDoc(menuRef, {
      "settings.discounts": cleaned,
      "settings.discountsUpdatedAt": Date.now(),
    });

    // ACTUALIZACIÓN CRÍTICA: Actualizar el estado global del menú
    // Esto hace que la nube y tu pantalla local estén sincronizadas de inmediato
    setMenu(prev => ({
      ...prev,
      settings: {
        ...(prev?.settings || {}),
        discounts: cleaned,
        discountsUpdatedAt: Date.now()
      }
    }));

    // Actualizamos el estado local de los inputs
    setDiscounts(cleaned);
    
    alert("Promociones guardadas en la nube ✅");
  } catch (error) {
    console.error("Error al guardar descuentos:", error);
    alert("Hubo un error al guardar. Revisa la consola.");
  }
};

  return (
    <div className="p-6 bg-rose-50/50 border border-rose-100 rounded-[2rem]">
      {/* Controles */}
      <div className="flex flex-col md:flex-row gap-4 items-end mb-6">
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">Sección</label>
          <select 
            className="w-full border border-gray-200 p-3 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-rose-200" 
            value={promoType} 
            onChange={(e) => { setPromoType(e.target.value); setPromoProductId(""); }}
          >
            <option value="bowls">Bowls</option>
            <option value="fruver">Mercado (Fruver)</option>
            <option value="parfaits">Parfaits</option>
          </select>
        </div>
        
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">Producto a descontar</label>
          <select 
            className="w-full border border-gray-200 p-3 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-rose-200" 
            value={promoProductId} 
            onChange={(e) => setPromoProductId(e.target.value)}
          >
            <option value="">Selecciona un producto...</option>
            <option value="TODOS" className="font-bold text-rose-600 bg-rose-50">⭐ Aplicar a TODOS los {promoType}</option>
            {(promoType === "bowls" ? bowlsList : promoType === "parfaits" ? parfaitList : fruverList).map(item => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
        
        <div className="w-full md:w-32">
          <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">Desc. (%)</label>
          <input 
            type="number" 
            className="w-full border border-gray-200 p-3 rounded-xl text-sm outline-none bg-white focus:ring-2 focus:ring-rose-200" 
            placeholder="Ej: 15" 
            value={promoPercent} 
            onChange={(e) => setPromoPercent(e.target.value)} 
          />
        </div>
        
        <button 
          onClick={upsertPromo} 
          className="px-6 py-3 bg-rose-100 text-rose-700 font-bold rounded-xl hover:bg-rose-200 shadow-sm transition-all active:scale-95 whitespace-nowrap"
        >
          Añadir al borrador
        </button>
      </div>

      {/* BOTÓN MAESTRO DE GUARDADO */}
      <div className="mb-8">
        <button 
          onClick={saveDiscounts} 
          className="w-full py-3.5 bg-rose-500 text-white font-black rounded-xl hover:bg-rose-600 shadow-lg shadow-rose-500/30 transition-all active:scale-95"
        >
          Guardar Promociones en la Nube ☁️
        </button>
      </div>

      {/* Visualizador de Descuentos Activos */}
      <h4 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-widest border-b pb-2">
        Descuentos activos en {promoType}
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
        {(promoType === "bowls" ? bowlsList : promoType === "parfaits" ? parfaitList : fruverList).map((it) => {
          const pct = discounts?.[promoType]?.[it.id] || 0;
          if (pct <= 0) return null;
          return (
            <div key={it.id} className="border border-rose-200 rounded-2xl p-3 text-center relative bg-white shadow-sm flex flex-col">
              <div className="absolute -top-2 -right-2 bg-yellow-500 text-white text-[11px] font-black px-2.5 py-1 rounded-full shadow-md z-10 animate-bounce">
                -{pct}%
              </div>
              <img src={it.img || "https://via.placeholder.com/100"} className="w-16 h-16 mx-auto object-cover rounded-xl mb-2" alt={it.name}/>
              <p className="text-xs font-bold truncate text-gray-800">{it.name}</p>
              <button 
                onClick={() => removePromo(promoType, it.id)} 
                className="mt-auto pt-2 text-[10px] text-red-500 font-bold uppercase hover:underline"
              >
                Quitar promo
              </button>
            </div>
          );
        })}
        
        {!(promoType === "bowls" ? bowlsList : promoType === "parfaits" ? parfaitList : fruverList).some(it => (discounts?.[promoType]?.[it.id] || 0) > 0) && (
          <div className="col-span-full text-center text-gray-400 text-sm py-4 italic">
            No hay descuentos activos en esta categoría.
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorPromoCodes
// ==========================================
function EditorPromoCodes({ menu, setMenu, db }) {
  // Inicializamos el estado interno
 const initialPromoCodes = React.useMemo(() => {
    return Array.isArray(menu?.settings?.promoCodes) ? menu?.settings?.promoCodes : [];
  }, [menu?.settings?.promoCodes]);

  const [promoCodes, setPromoCodes] = React.useState(initialPromoCodes);

  React.useEffect(() => {
    setPromoCodes(initialPromoCodes);
  }, [initialPromoCodes]);

  // Funciones de control movidas aquí adentro
  const addPromoCode = () => {
    const id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    setPromoCodes(prev => [
      ...prev, 
      { id, code: "", discount: 0, minAmount: 0, active: true }
    ]);
  };

  const updatePromoCode = (id, field, value) => {
    setPromoCodes(prev => prev.map(promo => {
      if (promo.id === id) {
        return { 
          ...promo, 
          [field]: field === 'code' ? String(value).toUpperCase().trim() : 
                   field === 'active' ? Boolean(value) :
                   Math.max(0, Number(value) || 0)
        };
      }
      return promo;
    }));
  };

  const removePromoCode = (id) => {
    setPromoCodes(prev => prev.filter(promo => promo.id !== id));
  };

  const savePromoCodes = async () => {
    // Limpiamos códigos vacíos antes de guardar
    const cleaned = promoCodes.filter(p => p.code && p.code.length > 0).map(p => ({
      id: p.id,
      code: p.code,
      discount: Math.min(100, Math.max(0, Number(p.discount) || 0)),
      minAmount: Math.max(0, Number(p.minAmount) || 0),
      active: Boolean(p.active)
    }));
    
    // Asumimos que doc y updateDoc están importados
    const { doc, updateDoc } = require("firebase/firestore"); 
    const menuRef = doc(db, "menu", "config"); 
    await updateDoc(menuRef, {
      promoCodes: cleaned,
    });
    
    // También actualizamos el contexto local
    setMenu(prev => ({ ...prev, promoCodes: cleaned }));
    alert("Códigos promocionales guardados en la nube ✅");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 mb-4">
        Crea códigos de descuento (ej. <b>VERANO20</b>) con un porcentaje y un monto mínimo de compra.
      </p>

      {promoCodes.length === 0 ? (
        <div className="text-center p-6 bg-gray-50 rounded-2xl border border-gray-100 text-gray-500">
          Aún no hay códigos. Haz clic en "+ Agregar código" para comenzar.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {promoCodes.map((promo) => (
            <div key={promo.id} className={`border rounded-2xl p-4 space-y-4 shadow-sm transition-colors ${promo.active ? 'bg-white border-emerald-100' : 'bg-gray-50 border-gray-200 opacity-75'}`}>
              
              {/* Encabezado del Código */}
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <span className="font-bold text-gray-800 text-sm">Configuración</span>
                <button 
                  onClick={() => updatePromoCode(promo.id, 'active', !promo.active)}
                  className={`text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wide transition-all ${promo.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                >
                  {promo.active ? '✅ Activo' : '❌ Pausado'}
                </button>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Código (Ej: NUEVO10)</label>
                  <input
                    className="w-full border border-gray-200 p-2.5 rounded-xl uppercase text-sm font-bold outline-none focus:border-emerald-400 bg-white"
                    placeholder="CÓDIGO"
                    value={promo.code}
                    onChange={(e) => updatePromoCode(promo.id, 'code', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">% Descuento</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-full border border-gray-200 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-emerald-400 bg-white"
                    value={promo.discount}
                    onChange={(e) => updatePromoCode(promo.id, 'discount', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Mínimo de compra ($)</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-gray-200 p-2.5 rounded-xl text-sm outline-none focus:border-emerald-400 bg-white"
                  placeholder="Ej: 15000"
                  value={promo.minAmount}
                  onChange={(e) => updatePromoCode(promo.id, 'minAmount', e.target.value)}
                />
                <p className="text-[10px] text-gray-400 mt-1.5 font-medium leading-tight">
                  Si no requiere compra mínima, déjalo en 0.
                </p>
              </div>

              <div className="pt-2 text-right">
                <button
                  onClick={() => removePromoCode(promo.id)}
                  className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase tracking-wider"
                >
                  🗑️ Eliminar código
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* BOTÓN MAESTRO DE GUARDADO */}
      <div className="pt-4 mt-6">
        <button
          onClick={savePromoCodes}
          className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-black text-lg hover:bg-emerald-700 shadow-xl shadow-emerald-600/30 transition-all active:scale-95"
        >
          Guardar todos los códigos en la Nube ☁️
        </button>
      </div>
    </div>
  );
}


// ==========================================
// NUEVO COMPONENTE: EditorStaff
// ==========================================
function EditorStaff({ menu, setMenu, db, adminModules }) {
  // Estados movidos desde la Intranet
  const initialStaff = React.useMemo(() => {
    return Array.isArray(menu?.staff) ? menu.staff : [];
  }, [menu?.staff]);

  const [staffList, setStaffList] = React.useState(initialStaff);
  const [editingStaff, setEditingStaff] = React.useState(null);

  React.useEffect(() => {
    setStaffList(initialStaff);
  }, [initialStaff]);

  // Funciones de control encapsuladas
const addStaffMember = () => {
  const id = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  setEditingStaff({
    id,
    name: "",
    email: "",
    active: true,
    permissions: {}
  });
};
  const saveEditingStaff = () => {
  // Validaciones básicas
  if (!editingStaff.name || !editingStaff.email) {
    alert("Por favor completa nombre y correo.");
    return;
  }

  setStaffList(prev => {
    // Revisamos si el ID ya existe en la lista
    const exists = prev.find(u => u.id === editingStaff.id);
    
    if (exists) {
      // Si existe, lo actualizamos (EDICIÓN)
      return prev.map(u => u.id === editingStaff.id ? editingStaff : u);
    } else {
      // Si no existe, lo agregamos al final (CREACIÓN)
      return [...prev, editingStaff];
    }
  });

  // Limpiamos el formulario para cerrarlo
  setEditingStaff(null);
};


const removeStaff = (id) => {
  if (window.confirm("¿Estás seguro de eliminar a este empleado?")) {
    setStaffList(prev => prev.filter(u => u.id !== id));
  }
};

  const handleSaveStaff = async () => {
  try {
    const nextMenu = { 
      ...(menu || {}), 
      staff: staffList // Guardamos la lista actual en el objeto menu
    };
    await setMenu(nextMenu);
    alert("¡Personal guardado en la nube con éxito! ☁️✅");
  } catch (error) {
    console.error(error);
    alert("Error al guardar en la nube.");
  }
};

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 mb-4">
        Agrega el correo de tus empleados y dales acceso solo a las áreas que necesitan. <br/>
        <span className="text-xs text-gray-400">Nota: La contraseña la crean registrándose en la app o desde tu consola de Firebase.</span>
      </p>

      <button 
  onClick={addStaffMember} 
  className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all mb-4"
>
  + Nuevo Empleado
</button>

      {/* FORMULARIO PARA CREAR / EDITAR */}
      {editingStaff && (
        <div className="bg-blue-50/50 border border-blue-200 p-5 rounded-2xl mb-6 shadow-inner animate-fade-in">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-blue-800">Datos del Usuario</h4>
            <button onClick={() => setEditingStaff(null)} className="text-gray-400 hover:text-gray-600 font-bold">✕ Cancelar</button>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Nombre</label>
              <input
                type="text"
                className="w-full border p-2.5 rounded-xl text-sm outline-none focus:border-blue-400"
                placeholder="Ej: Juan Cajero"
                value={editingStaff.name}
                onChange={(e) => setEditingStaff({...editingStaff, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Correo Electrónico</label>
              <input
                type="email"
                className="w-full border p-2.5 rounded-xl text-sm outline-none focus:border-blue-400 lowercase"
                placeholder="juan@mascampo.com"
                value={editingStaff.email}
                onChange={(e) => setEditingStaff({...editingStaff, email: e.target.value.toLowerCase()})}
              />
            </div>
          </div>

          <h4 className="font-bold text-blue-800 mb-2 mt-4">Permisos de Acceso</h4>
          <div className="grid sm:grid-cols-2 gap-3 bg-white p-4 rounded-xl border border-blue-100">
            {(adminModules || []).map(mod => (
              <label key={mod.id} className="flex items-center gap-3 cursor-pointer group p-1">
                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${editingStaff.permissions[mod.id] ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                  {editingStaff.permissions[mod.id] && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden"
                  checked={!!editingStaff.permissions[mod.id]}
                  onChange={(e) => setEditingStaff({
                    ...editingStaff,
                    permissions: { ...editingStaff.permissions, [mod.id]: e.target.checked }
                  })}
                />
                <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">{mod.name}</span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex gap-2 justify-end">
            <button onClick={saveEditingStaff} className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">
              Aceptar y Agregar a la lista
            </button>
          </div>
        </div>
      )}

      {/* LISTA DE USUARIOS ACTIVOS */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staffList.map((user) => (
          <div key={user.id} className={`border p-4 rounded-2xl shadow-sm ${user.active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-bold text-gray-800">{user.name || 'Sin nombre'}</h4>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <button 
                onClick={() => {
                  const updated = staffList.map(u => u.id === user.id ? {...u, active: !u.active} : u);
                  setStaffList(updated);
                }}
                className={`text-[10px] font-bold px-2 py-1 rounded-md ${user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
              >
                {user.active ? 'Activo' : 'Suspendido'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1 my-3">
              {(adminModules || []).map(mod => user.permissions[mod.id] && (
                <span key={mod.id} className="text-[9px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {mod.name.split(' ')[0]} {/* Muestra solo el emoji y primera palabra */}
                </span>
              ))}
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-3 mt-auto">
              <button onClick={() => setEditingStaff(user)} className="text-xs font-bold text-blue-600 hover:text-blue-800">✏️ Editar</button>
              <button onClick={() => removeStaff(user.id)} className="text-xs font-bold text-red-500 hover:text-red-700">🗑️ Borrar</button>
            </div>
          </div>
        ))}
        
        {staffList.length === 0 && !editingStaff && (
          <div className="col-span-full text-center p-6 text-gray-400 border border-dashed rounded-2xl">
            Aún no has agregado empleados.
          </div>
        )}
      </div>

      <button onClick={handleSaveStaff} className="w-full mt-6 py-4 rounded-2xl bg-gray-900 text-white font-black text-lg hover:bg-black shadow-lg transition-all active:scale-95">
        Guardar Cambios en la Nube ☁️
      </button>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorTemporada
// ==========================================
function EditorTemporada({ menu, setMenu }) {
  // Lista de Fruver
  const fruverList = Array.isArray(menu?.fruver) ? menu.fruver : [];
  
  // Descuentos para mostrar la etiqueta de OFERTA
  const discounts = menu?.settings?.discounts || {};

  // Estado local para los IDs seleccionados
  const initialSeasonal = React.useMemo(() => {
    return Array.isArray(menu?.settings?.seasonalFruver) ? menu.settings.seasonalFruver : [];
  }, [menu?.settings?.seasonalFruver]);

  const [seasonalIDs, setSeasonalIDs] = React.useState(initialSeasonal);

  React.useEffect(() => {
    setSeasonalIDs(initialSeasonal);
  }, [initialSeasonal]);

  const toggleSeasonal = (id) => {
    setSeasonalIDs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const saveSeasonal = async () => {
    const next = {
      ...(menu || {}),
      settings: {
        ...(menu?.settings || {}),
        seasonalFruver: seasonalIDs,
      },
    };
    await setMenu(next);
    alert("Productos de temporada guardados ✅");
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Marca los productos que quieres destacar en “Temporada”. Si además tienen promoción activa, verás la etiqueta <b>OFERTA</b>.
      </p>

      {fruverList.length === 0 ? (
        <div className="text-sm text-gray-500">Aún no hay productos fruver.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fruverList
            .slice()
            .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")))
            .map((it) => {
              const pct = Number(discounts?.fruver?.[it.id] || 0);
              const isSelected = seasonalIDs.includes(it.id);
              
              return (
                <label
                  key={it.id}
                  className={`relative flex items-center gap-3 border rounded-lg p-3 bg-white hover:shadow-sm transition cursor-pointer ${
                    isSelected ? "ring-2 ring-emerald-300 border-emerald-300 bg-emerald-50/30" : ""
                  }`}
                >
                  {/* mini preview */}
                  <div className="w-16 h-16 rounded-md bg-gray-100 overflow-hidden shrink-0">
                    {it.img ? (
                      <img className="w-full h-full object-cover" src={it.img} alt={it.name} />
                    ) : null}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate text-sm">{it.name}</div>
                      {pct > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                          OFERTA {pct}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{it.id}</div>
                  </div>

                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-emerald-600 cursor-pointer"
                    checked={isSelected}
                    onChange={() => toggleSeasonal(it.id)}
                  />
                </label>
              );
            })}
        </div>
      )}

      <div className="text-right">
        <button
          onClick={saveSeasonal}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm font-medium"
        >
          Guardar temporada
        </button>
      </div>
    </div>
  );
}



// ==========================================
// NUEVO COMPONENTE: EditorCombo
// ==========================================
function EditorCombo({ menu, setMenu }) {
  // Inicialización segura del estado a partir del menú
  const initialComboForm = React.useMemo(() => ({
    price: menu?.combo?.price || 0,
  }), [menu?.combo?.price]);

  const initialBebidasText = React.useMemo(() => {
    return Array.isArray(menu?.combo?.bebidas) 
      ? menu.combo.bebidas.join('\n') 
      : "";
  }, [menu?.combo?.bebidas]);

  const initialSnacksText = React.useMemo(() => {
    return Array.isArray(menu?.combo?.snacks) 
      ? menu.combo.snacks.join('\n') 
      : "";
  }, [menu?.combo?.snacks]);

  const [comboForm, setComboForm] = React.useState(initialComboForm);
  const [bebidasText, setBebidasText] = React.useState(initialBebidasText);
  const [snacksText, setSnacksText] = React.useState(initialSnacksText);

  // Sincroniza si cambia el menú en el servidor
  React.useEffect(() => {
    setComboForm(initialComboForm);
    setBebidasText(initialBebidasText);
    setSnacksText(initialSnacksText);
  }, [initialComboForm, initialBebidasText, initialSnacksText]);

  const saveCombo = async () => {
    // Función de ayuda para limpiar y separar textos
    const parseList = (text) => {
      return text
        .split(/[\n,]+/) // Separa por comas o saltos de línea
        .map(t => t.trim())
        .filter(t => t.length > 0);
    };

    const nextCombo = {
      price: Number(comboForm.price) || 0,
      bebidas: parseList(bebidasText),
      snacks: parseList(snacksText),
    };

    const next = { ...(menu || {}), combo: nextCombo };
    await setMenu(next);
    alert("Combo guardado ✅");
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio del combo</label>
          <input
            type="number"
            className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-emerald-200"
            value={comboForm.price}
            onChange={(e) => setComboForm((f) => ({ ...f, price: e.target.value }))}
          />
          <p className="mt-1 text-xs text-gray-500">Se suma cuando el cliente marca “Sí, quiero combo”.</p>
        </div>

        <div className="md:col-span-1" />

        <div className="md:col-span-3 grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Bebidas 250 ml <span className="text-gray-500">(una por línea o separadas por comas)</span>
            </label>
            <textarea
              rows={6}
              className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-emerald-200"
              value={bebidasText}
              onChange={(e) => setBebidasText(e.target.value)}
              placeholder={"Coca-Cola 250 ml\nSprite 250 ml\nAgua 250 ml"}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">
              Snacks <span className="text-gray-500">(una por línea o separadas por comas)</span>
            </label>
            <textarea
              rows={6}
              className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-emerald-200"
              value={snacksText}
              onChange={(e) => setSnacksText(e.target.value)}
              placeholder={"Papas chips\nChicharrón\nYuca frita"}
            />
          </div>
        </div>
      </div>

      <div className="text-right">
        <button
          onClick={saveCombo}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors"
        >
          Guardar combo
        </button>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTE: Editor de Precio del Parfait
// ==========================================
function EditorPrecioParfait({ menu, setMenu }) {
  // Leemos el precio actual o empezamos en 0
  const [precio, setPrecio] = React.useState(menu?.parfaitBasePrice || 0);

  const guardarPrecio = async () => {
    try {
      const nextMenu = { ...menu, parfaitBasePrice: Number(precio) };
      await setMenu(nextMenu);
      alert("¡Precio del Parfait actualizado con éxito! ✅");
    } catch (error) {
      alert("Error al guardar el precio.");
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-sm mb-6">
      <h3 className="font-bold text-gray-800 mb-1">Precio Base del Parfait</h3>
      <p className="text-[11px] text-gray-500 mb-4">Este será el precio de venta al público en la app.</p>
      
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
          <span className="text-gray-400 font-bold">$</span>
          <input
            type="number"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="w-full bg-transparent p-2 outline-none font-bold text-gray-800"
            placeholder="Ej: 15000"
          />
        </div>
        <button 
          onClick={guardarPrecio}
          className="bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl hover:bg-emerald-700 shadow-sm"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorBebidasCategorias
// ==========================================
function EditorBebidasCategorias({ menu, setMenu, slugify }) {
  // Inicializamos el estado desde el menú
  const initialCats = React.useMemo(() => {
    return Array.isArray(menu?.beveragesCategories) ? menu.beveragesCategories : [];
  }, [menu?.beveragesCategories]);

  const [bebCats, setBebCats] = React.useState(initialCats);

  React.useEffect(() => {
    setBebCats(initialCats);
  }, [initialCats]);

  // Lista de todas las bebidas disponibles en el menú
  const bebidasCatalog = Array.isArray(menu?.bebidas) ? menu.bebidas : [];

  // --- Funciones de control ---
  const addBebCat = () => {
    const id = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    setBebCats(prev => [...prev, { id, name: "Nueva categoría", beverageIds: [] }]);
  };

  const updBebCat = (idx, patch) => {
    setBebCats(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const moveUpCat = (idx) => {
    if (idx === 0) return;
    setBebCats(prev => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[idx - 1];
      next[idx - 1] = temp;
      return next;
    });
  };

  const moveDownCat = (idx) => {
    if (idx === bebCats.length - 1) return;
    setBebCats(prev => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[idx + 1];
      next[idx + 1] = temp;
      return next;
    });
  };

  const removeBebCat = (id) => {
    if (window.confirm("¿Seguro que deseas eliminar esta categoría?")) {
      setBebCats(prev => prev.filter(c => c.id !== id));
    }
  };

  const toggleBeverageInCat = (catIdx, bevId) => {
    setBebCats(prev => {
      const next = [...prev];
      const currentIds = next[catIdx].beverageIds || [];
      if (currentIds.includes(bevId)) {
        next[catIdx].beverageIds = currentIds.filter(id => id !== bevId);
      } else {
        next[catIdx].beverageIds = [...currentIds, bevId];
      }
      return next;
    });
  };

  const saveBeverageCategories = async () => {
    const cleaned = bebCats.map(c => ({
      id: c.id || slugify(c.name || "cat"),
      name: String(c.name || "").trim(),
      beverageIds: Array.isArray(c.beverageIds) ? c.beverageIds : [],
    }));
    
    const next = { ...(menu || {}), beveragesCategories: cleaned };
    await setMenu(next);
    alert("Categorías de bebidas guardadas ✅");
  };

  return (
    <div className="space-y-4">
      {/* Botón movido desde el aside del Accordion */}
      <div className="flex justify-end mb-4">
        <button
          onClick={addBebCat}
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
        >
          + Agregar categoría
        </button>
      </div>

      {bebCats.length === 0 ? (
        <div className="text-sm text-gray-500">
          Aún no hay categorías. Crea una y asigna las bebidas existentes.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {bebCats.map((cat, idx) => (
            <div key={cat.id} className="border rounded-lg p-3">
              {/* Encabezado con orden */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded bg-gray-100 border text-gray-600">
                    #{idx + 1}
                  </span>
                  <input
                    className="w-full border p-2 rounded-lg font-medium outline-none focus:border-emerald-400"
                    value={cat.name}
                    onChange={(e) => updBebCat(idx, { name: e.target.value })}
                    placeholder="Nombre de la categoría"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveUpCat(idx)}
                    disabled={idx === 0}
                    className="px-2 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    title="Subir"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDownCat(idx)}
                    disabled={idx === bebCats.length - 1}
                    className="px-2 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    title="Bajar"
                  >
                    ▼
                  </button>

                  <button
                    onClick={() => removeBebCat(cat.id)}
                    className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 ml-2"
                    title="Eliminar categoría"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Asignación de bebidas */}
              <div className="mt-3">
                <div className="text-sm text-gray-700 mb-2 font-bold">Asignar bebidas</div>
                {bebidasCatalog.length === 0 ? (
                  <div className="text-xs text-gray-500">Aún no tienes bebidas creadas en el menú.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {bebidasCatalog
                      .slice()
                      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")))
                      .map((b) => {
                        const checked = (cat.beverageIds || []).includes(b.id);
                        return (
                          <label key={b.id} className={`flex items-center gap-2 border rounded-md p-2 cursor-pointer transition-colors ${checked ? 'bg-emerald-50 border-emerald-200' : 'bg-white hover:bg-gray-50'}`}>
                            <input
                              type="checkbox"
                              className="accent-emerald-600 cursor-pointer"
                              checked={checked}
                              onChange={() => toggleBeverageInCat(idx, b.id)}
                            />
                            <span className="text-sm truncate">{b.name}</span>
                          </label>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-right mt-4">
        <button
          onClick={saveBeverageCategories}
          className="px-6 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 font-bold"
        >
          Guardar categorías
        </button>
      </div>
    </div>
  );
}

// ==========================================
// NUEVO COMPONENTE: EditorFruver
// ==========================================
function EditorFruver({ menu, setMenu, slugify }) {
  // Inicializar estado desde el menú
  const initialFruver = React.useMemo(() => {
    return Array.isArray(menu?.fruver) ? menu.fruver : [];
  }, [menu?.fruver]);

  const [fruver, setFruver] = React.useState(initialFruver);
  const [fruverFilter, setFruverFilter] = React.useState("all");

  React.useEffect(() => {
    setFruver(initialFruver);
  }, [initialFruver]);

  // Derivar lista visible según el filtro
  const fruverVisible = React.useMemo(() => {
    return fruver.filter(x => {
      if (fruverFilter === "active") return x.active !== false;
      if (fruverFilter === "inactive") return x.active === false;
      return true;
    });
  }, [fruver, fruverFilter]);

  // Funciones de control
  const addFruver = () => {
    const id = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    setFruver(prev => [{ id, name: "Nuevo producto", price: 0, unit: "lb", img: "", active: true }, ...prev]);
  };

  const updFruverById = (id, patch) => {
    setFruver(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const removeFruver = (id) => {
    if (window.confirm("¿Seguro que deseas eliminar este producto?")) {
      setFruver(prev => prev.filter(x => x.id !== id));
    }
  };

  const saveFruver = async () => {
    const cleaned = fruver.map(x => ({
      id: x.id || slugify(x.name || "producto"),
      name: String(x.name || "").trim(),
      price: Number(x.price || 0) || 0,
      unit: String(x.unit || "lb"),
      img: String(x.img || ""),
      active: x.active !== false // Por defecto true
    }));
    
    const next = { ...(menu || {}), fruver: cleaned };
    await setMenu(next);
    alert("Productos de fruver guardados ✅");
  };

  return (
    <div className="space-y-4">
      {/* Botón de Agregar movido aquí para fácil acceso */}
      <div className="flex justify-end mb-2">
        <button
          onClick={addFruver}
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
        >
          + Agregar producto
        </button>
      </div>

      {/* Controles de filtro */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
        <div className="inline-flex rounded-lg border overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setFruverFilter("all")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${fruverFilter === "all" ? "bg-emerald-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFruverFilter("active")}
            className={`px-3 py-1.5 text-sm font-medium border-l transition-colors ${fruverFilter === "active" ? "bg-emerald-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
          >
            Activos
          </button>
          <button
            type="button"
            onClick={() => setFruverFilter("inactive")}
            className={`px-3 py-1.5 text-sm font-medium border-l transition-colors ${fruverFilter === "inactive" ? "bg-emerald-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
          >
            Inactivos
          </button>
        </div>

        <div className="text-xs text-gray-500 font-medium">
          Total: {fruver.length} · Activos: {fruver.filter(x => x.active !== false).length} · Inactivos: {fruver.filter(x => x.active === false).length}
        </div>
      </div>

      {/* Lista de productos */}
      {(!fruverVisible || fruverVisible.length === 0) ? (
        <div className="text-sm text-gray-500 text-center py-6 border border-dashed rounded-xl">
          No hay productos fruver para mostrar con este filtro.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fruverVisible.map((it) => (
            <div key={it.id} className={`border rounded-xl overflow-hidden shadow-sm transition-opacity ${it.active === false ? 'bg-gray-50 opacity-75' : 'bg-white'}`}>
              <div className="w-full aspect-square bg-gray-100 overflow-hidden relative">
                {it.active === false && (
                  <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md z-10">
                    INACTIVO
                  </div>
                )}
                {it.img ? <img src={it.img} alt={it.name} className="w-full h-full object-cover" /> : null}
              </div>
              <div className="p-3 space-y-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1 font-bold">Nombre</label>
                  <input
                    className="w-full border p-2 rounded-lg outline-none focus:border-emerald-400"
                    value={it.name ?? ""}
                    onChange={(e) => updFruverById(it.id, { name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-bold">Precio</label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded-lg outline-none focus:border-emerald-400"
                      value={Number(it.price || 0)}
                      onChange={(e) => updFruverById(it.id, { price: Number(e.target.value || 0) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-bold">Unidad</label>
                    <select
                      className="w-full border p-2 rounded-lg outline-none focus:border-emerald-400 bg-white"
                      value={it.unit || "lb"}
                      onChange={(e) => updFruverById(it.id, { unit: e.target.value })}
                    >
                      <option value="lb">Libra (lb)</option>
                      <option value="unidad">Unidad</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1 font-bold">URL imagen</label>
                  <input
                    className="w-full border p-2 rounded-lg outline-none focus:border-emerald-400"
                    value={it.img ?? ""}
                    onChange={(e) => updFruverById(it.id, { img: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                
                {/* Toggle Activo/Inactivo */}
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                  <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-emerald-600 w-4 h-4 cursor-pointer"
                      checked={it.active !== false}
                      onChange={(e) => updFruverById(it.id, { active: e.target.checked })}
                    />
                    <span className={`font-bold ${it.active === false ? "text-red-600" : "text-emerald-700"}`}>
                      {it.active === false ? "Inactivo" : "Activo"}
                    </span>
                  </label>
                  {it.active === false && (
                    <span className="text-[10px] text-gray-500 leading-tight">
                      (Oculto)
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <small className="text-gray-400 break-all text-[9px]">{it.id}</small>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors text-xs font-bold"
                    onClick={() => removeFruver(it.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-right pt-4">
        <button
          onClick={saveFruver}
          className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-sm transition-transform active:scale-95"
        >
          Guardar fruver en la nube ☁️
        </button>
      </div>
    </div>
  );
}


// ==========================================
// NUEVO COMPONENTE: EditorWhatsApp
// ==========================================
function EditorWhatsApp({ menu, setMenu }) {
  // Inicialización del estado interno
  const initialTemplates = React.useMemo(() => ({
    newOrder: menu?.waTemplates?.newOrder || "",
    outForDelivery: menu?.waTemplates?.outForDelivery || "",
    readyForPickup: menu?.waTemplates?.readyForPickup || "",
  }), [menu?.waTemplates]);

  const [templates, setTemplates] = React.useState(initialTemplates);

  // Sincronizar si los datos cambian en la base de datos
  React.useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);

  const saveTemplates = async () => {
    const next = { 
      ...(menu || {}), 
      waTemplates: { ...templates } 
    };
    await setMenu(next);
    alert("Plantillas de WhatsApp guardadas ✅");
  };

  const placeholders = [
    "{{orderId}}", "{{nombre}}", "{{telefono}}", "{{direccion}}", 
    "{{metodoPago}}", "{{modo}}", "{{enMinutos}}", "{{total}}", "{{items}}"
  ];

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
        <p className="text-xs font-bold text-blue-800 mb-2">Variables disponibles (puedes copiarlas y pegarlas):</p>
        <div className="flex flex-wrap gap-2">
          {placeholders.map(p => (
            <code key={p} className="bg-white px-1.5 py-0.5 rounded border text-[10px] text-gray-700 font-mono">
              {p}
            </code>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {/* Confirmación */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Mensaje de <b>Confirmación</b> (al crear pedido)
          </label>
          <textarea
            rows={6}
            className="w-full border p-2 rounded-lg font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            value={templates.newOrder}
            onChange={(e) => setTemplates((t) => ({ ...t, newOrder: e.target.value }))}
            placeholder="Ej: Hola {{nombre}}, recibimos tu pedido {{orderId}}..."
          />
        </div>

        {/* En Camino */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Mensaje <b>En camino</b>
          </label>
          <textarea
            rows={5}
            className="w-full border p-2 rounded-lg font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            value={templates.outForDelivery}
            onChange={(e) => setTemplates((t) => ({ ...t, outForDelivery: e.target.value }))}
            placeholder="Ej: ¡Buenas noticias! Tu pedido va en camino a {{direccion}}."
          />
        </div>

        {/* Listo para recoger */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Mensaje <b>Listo para recoger</b>
          </label>
          <textarea
            rows={5}
            className="w-full border p-2 rounded-lg font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-200"
            value={templates.readyForPickup}
            onChange={(e) => setTemplates((t) => ({ ...t, readyForPickup: e.target.value }))}
            placeholder="Ej: Hola {{nombre}}, ya puedes pasar por tu pedido a la tienda."
          />
        </div>

        <div className="flex justify-end pt-2">
          <button 
            onClick={saveTemplates} 
            className="px-6 py-2.5 rounded-xl bg-emerald-700 text-white font-bold hover:bg-emerald-800 shadow-md transition-transform active:scale-95"
          >
            Guardar plantillas
          </button>
        </div>
      </div>
    </div>
  );
}


// ==========================================
// NUEVO COMPONENTE: EditorFruverBulk
// ==========================================
function EditorFruverBulk({ menu, setMenu }) {
  const fruverItems = Array.isArray(menu?.fruver) ? menu.fruver : [];

  const handleApply = async (nextArray) => {
    try {
      // MERGE directo en el objeto menu
      const next = { 
        ...(menu || {}), 
        fruver: nextArray 
      };
      
      await setMenu(next); 
      alert("Precios de fruver actualizados ✅");
    } catch (error) {
      console.error("Error actualizando precios masivos:", error);
      alert("Error al guardar los nuevos precios.");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Utiliza esta herramienta para actualizar precios de múltiples productos rápidamente mediante una lista de texto.
      </p>
      
      <FruverBulkPricesLite 
        items={fruverItems} 
        onApply={handleApply} 
      />
    </div>
  );
}

// ==========================================
// COMPONENTE BASE: AccordionCard
// ==========================================
function AccordionCard({ id, title, aside, children }) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-4 transition-all hover:shadow-md">
      <div 
        className="p-5 flex items-center justify-between cursor-pointer select-none bg-white hover:bg-gray-50/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isOpen ? 'bg-emerald-600 text-white rotate-90' : 'bg-gray-100 text-gray-400 rotate-0'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="font-black text-gray-800 text-lg tracking-tight">{title}</h3>
        </div>
        
        <div className="flex items-center gap-3">
          {aside && <div onClick={(e) => e.stopPropagation()}>{aside}</div>}
        </div>
      </div>

      <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
        <div className="p-6 pt-2 border-t border-gray-50 bg-white">
          {children}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTE: Editor de Frutas para Parfaits
// ==========================================
function EditorFrutasParfait({ menu, setMenu }) {
  // Cargamos las frutas de la BD, o ponemos las 4 por defecto si está vacío
  const [frutas, setFrutas] = React.useState(menu?.parfaitFruits || [
    { id: 'f1', name: 'Fresa' },
    { id: 'f2', name: 'Banano' },
    { id: 'f3', name: 'Arándanos' },
    { id: 'f4', name: 'Mango' }
  ]);

  const addFruta = () => setFrutas([...frutas, { id: Date.now().toString(), name: "" }]);
  
  const updateFruta = (id, val) => {
    setFrutas(frutas.map(f => f.id === id ? { ...f, name: val } : f));
  };

  const removeFruta = (id) => setFrutas(frutas.filter(f => f.id !== id));

  const saveFrutas = async () => {
    try {
      // Filtramos para no guardar campos vacíos
      const cleanFrutas = frutas.filter(f => f.name.trim() !== "");
      await setMenu({ ...menu, parfaitFruits: cleanFrutas });
      alert("¡Lista de frutas guardada con éxito! ✅");
    } catch (error) {
      alert("Error al guardar las frutas.");
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-sm mb-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-gray-800">Frutas del Parfait</h3>
          <p className="text-[11px] text-gray-500">Opciones para que el cliente excluya.</p>
        </div>
        <button onClick={addFruta} className="bg-gray-900 text-white w-8 h-8 rounded-full font-bold hover:bg-black transition-colors">
          +
        </button>
      </div>
      
      <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-1">
        {frutas.map((f, i) => (
          <div key={f.id} className="flex gap-2">
            <input
              type="text"
              value={f.name}
              onChange={(e) => updateFruta(f.id, e.target.value)}
              className="flex-1 border border-gray-200 p-2 rounded-xl text-sm outline-none focus:border-emerald-500"
              placeholder={`Fruta ${i + 1}`}
            />
            <button 
              onClick={() => removeFruta(f.id)} 
              className="bg-red-50 text-red-500 px-3 rounded-xl hover:bg-red-100 font-bold"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button 
        onClick={saveFrutas}
        className="w-full bg-emerald-600 text-white font-bold py-2 rounded-xl hover:bg-emerald-700 shadow-sm transition-colors"
      >
        Guardar Frutas
      </button>
    </div>
  );
}


/* ============== Página Intranet ============== */
export default function Intranet() {
  

    const {
    role,
    menu,
    setMenu,
    pedidosPendientes,
    pedidosHistorico,
    updatePedidoStatus,
    completePedido,
    userDoc,
  } = usePedido();


  const currentUserEmail = auth.currentUser?.email || userDoc?.email;
  const isSuperAdmin = currentUserEmail?.toLowerCase() === "jestebanamp@gmail.com";
  const tienePermiso = (modulo) => isSuperAdmin || misPermisos[modulo];

const fmtMoney = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n || 0));

function makeRange(fromStr, toStr) {
  if (!fromStr && !toStr) return {};
  let startTs, endTs;
  if (fromStr) startTs = Timestamp.fromDate(new Date(fromStr + "T00:00:00"));
  if (toStr)   endTs   = Timestamp.fromDate(new Date(toStr + "T23:59:59"));
  return { startTs, endTs };
}



  // ====== IMÁGENES DE LA TIENDA ======
  const coverFromDb = menu?.settings?.storeImages?.cover;
  const coverUrl = (coverFromDb && coverFromDb.trim() !== '') 
    ? coverFromDb 
    : 'https://images.unsplash.com/photo-1543353071-873f17a7a088?q=80&w=1200&auto=format&fit=crop';

  const profileFromDb = menu?.settings?.storeImages?.profile;
  const profileUrl = (profileFromDb && profileFromDb.trim() !== '') 
    ? profileFromDb 
    : 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=150&auto=format&fit=crop';

    // ====== FUNCIÓN PARA GUARDAR IMÁGENES ======
  const handleSaveImages = async () => {
    try {
      // Aquí asumimos que tienes variables de estado para los inputs (ej. coverInput, profileInput)
      // Si tus inputs modifican directamente menu, esto lo guardará en Firebase:
      const nextMenu = {
        ...(menu || {}),
        settings: {
          ...(menu?.settings || {}),
          storeImages: {
            // Usa los valores actuales que tengas en el menú o las variables de tus inputs
            cover: menu?.settings?.storeImages?.cover || "",
            profile: menu?.settings?.storeImages?.profile || ""
          }
        }
      };
      
      await setMenu(nextMenu);
      alert("¡Imágenes actualizadas con éxito! ✅");
    } catch (error) {
      console.error("Error al guardar imágenes:", error);
      alert("Hubo un error al guardar las imágenes.");
    }
  };


 
  const settings = menu?.settings || {};
  const initialHours = useMemo(
    () => ({ ...DEFAULT_STORE_HOURS, ...(settings.storeHours || {}) }),
    [settings.storeHours]
  );
  const [storeHours, setStoreHours] = useState(initialHours);
  const [override, setOverride] = useState(settings.storeOverride || null); // 'open' | 'closed' | null

  useEffect(() => {
    setStoreHours({ ...DEFAULT_STORE_HOURS, ...(menu?.settings?.storeHours || {}) });
    setOverride(menu?.settings?.storeOverride || null);
  }, [menu?.settings?.storeHours, menu?.settings?.storeOverride]);

  // Abierto/cerrado efectivo (horario + override)
  const computeOpen = () => {
    if (override === "open") return true;
    if (override === "closed") return false;
    return isOpenBySchedule(storeHours, new Date());
  };

  const [openStore, setOpenStore] = useState(computeOpen());
  useEffect(() => {
    const id = setInterval(() => setOpenStore(computeOpen()), 30 * 1000);
    return () => clearInterval(id);
  }, [storeHours, override]); // recalcula ante cambios

  const saveStoreHours = async () => {
  const next = {
    ...(menu || {}),
    settings: {
      ...(menu?.settings || {}),
      storeHours: { ...storeHours },
    },
  };
  await setMenu(next);
  alert("Horario guardado ✅");
};

const setManualOverride = async (value) => {
  const next = {
    ...(menu || {}),
    settings: {
      ...(menu?.settings || {}),
      storeOverride: value, // 'open' | 'closed' | null
    },
  };
  await setMenu(next);
  setOverride(value || null);
  alert(
    value === null
      ? "Modo automático activado ✅"
      : `Tienda ${value === "open" ? "abierta" : "cerrada"} manualmente ✅`
  );
};

// ==========================================================
  // LÓGICA DE USUARIOS Y PERMISOS (STAFF)
  // ==========================================================


  // Carga los usuarios desde Firebase cuando entras a la Intranet


  // Lista de los módulos que se pueden bloquear/desbloquear
const adminModules = [
    { id: "pedidos", name: "📦 Gestión de Pedidos" },
    { id: "bowls-editor", name: "🥗 Bases para Bowls" },
    { id: "identidad", name: "🎨 Identidad y portada" },
    { id: "store-images", name: "🖼️ Imágenes de la tienda" },
    { id: "proteinas-editor", name: "🥩 Proteínas" },
    { id: "toppings-editor", name: "🥑 Toppings" },
    { id: "combo", name: "🥤 Combo: precio bebidas 250ml" },
    { id: "salsas-editor", name: "🥣 Salsas" },
    { id: "bebidas-editor", name: "🥤 Bebidas y Combos" },
    { id: "fruver-admin", name: "🥦 Mercado (Fruver)" },
    { id: "gestion-parfaits", name: "🍇 Parfaits" },
    { id: "promo-codes", name: "🎟️ Códigos Promocionales" },
    { id: "home", name: "⚙️ Inicio home split" },
    { id: "promo", name: "🎁 Promociones y descuentos" },
    { id: "horarios", name: "🕒 Horarios de Atención" },
    { id: "barrios", name: "🛵 Zonas de Domicilio" },
    { id: "wa", name: "💬 Plantillas de WhatsApp" },
    { id: "staff-users", name: "👥 Gestión de Usuarios" },
    { id: "bebidas-categorias", name: "🗂️ Categoría de bebidas" },
    { id: "temporada", name: "🌟 Productos de temporada (Fruver)" },
    { id: "fruver-precios", name: "📄 Fruver precios CSV" }
  ];

  // Ding cuando llega pedido nuevo
  const audioRef = useRef(null);
  const [prevCount, setPrevCount] = useState(pedidosPendientes.length);
  useEffect(() => {
    if (pedidosPendientes.length > prevCount) {
      audioRef.current?.play().catch(() => {
        if (audioRef.current) {
          audioRef.current.muted = false;
          audioRef.current.volume = 1;
          audioRef.current.play().catch(() => {});
        }
      });
    }
    setPrevCount(pedidosPendientes.length);
  }, [pedidosPendientes.length, prevCount]);

// ====== FUNCIÓN PARA IMPRIMIR COMANDA 58mm ======
const imprimirComanda = (pedido, menu) => {
  if (!pedido) return;

  const getName = (lista, id) => {
    if (!Array.isArray(lista)) return id;
    const item = lista.find(x => x.id === id);
    return item ? item.name : id;
  };

  const fmt = (n) => Number(n || 0).toLocaleString("es-CO");
  const orderIdCorto = String(pedido.id || "0000").slice(-5).toUpperCase();
  const fecha = new Date().toLocaleString("es-CO");

  let html = `
    <html>
      <head>
        <title>Comanda #${orderIdCorto}</title>
        <style>
          @page { margin: 0; }
          body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; margin: 0; padding: 4px; width: 58mm; }
          h2, h3, p { margin: 2px 0; }
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .item-row { display: flex; justify-content: space-between; margin-bottom: 2px; align-items: flex-start;}
          .item-name { flex: 1; padding-right: 5px; font-size: 13px; }
          .category-title { font-weight: bold; margin-top: 5px; margin-bottom: 1px; font-size: 10px; text-decoration: underline; text-transform: uppercase; }
          .sub-item { padding-left: 8px; font-size: 11px; line-height: 1.2; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <h2 class="bold">MÁS CAMPO</h2>
          <p>${pedido.type === 'fruver' ? 'LISTA DE MERCADO' : pedido.type === 'parfaits' ? 'PEDIDO DE PARFAITS' : 'PEDIDO GASTRO'}</p>
          <div class="divider"></div>
          <h3 class="bold">PEDIDO #${orderIdCorto}</h3>
          <p>${fecha}</p>
        </div>
        
        <div class="divider"></div>
        <p><span class="bold">Cliente:</span> ${pedido.entrega?.nombre || 'N/A'}</p>
        <p><span class="bold">Tel:</span> ${pedido.entrega?.telefono || 'N/A'}</p>
        <p><span class="bold">Dir:</span> ${pedido.entrega?.direccion || 'N/A'}</p>
        ${pedido.entrega?.barrioName ? `<p><span class="bold">Barrio:</span> ${pedido.entrega.barrioName}</p>` : ''}
        
        <div class="divider"></div>
        <p class="bold">CANT DESCRIPCIÓN         TOTAL</p>
        <div class="divider"></div>
  `;

  // AQUÍ SÍ VAN LOS ITEMS
  const items = Array.isArray(pedido.items) ? pedido.items : [];
  items.forEach((item) => {
    if (pedido.type === 'parfaits') {
      html += `
        <div class="item-row bold">
          <span class="item-name">${item.qty}x ${item.name}</span>
          <span>$${fmt(item.lineTotal || item.subtotal)}</span>
        </div>
      `;
      if (item.yogurt) html += `<div class="sub-item">- Yogurt: ${item.yogurt}</div>`;
      if (item.granola) html += `<div class="sub-item">- Granola: ${item.granola}</div>`;
    } 
    else if (pedido.type === 'fruver') {
      html += `
        <div class="item-row bold">
          <span class="item-name">${item.qty}x ${item.name}</span>
          <span>$${fmt(item.lineTotal || item.subtotal)}</span>
        </div>
        <div class="sub-item" style="margin-bottom:4px;">Unidad: ${item.unit || 'unidad'}</div>
      `;
    } 
    else {
      const bowlName = getName(menu?.bowls, item.bowlId) || 'Bowl Personalizado';
      html += `
        <div class="item-row bold">
          <span class="item-name">1x ${bowlName}</span>
          <span>$${fmt(item.price)}</span>
        </div>
      `;
      if (item.proteinas && typeof item.proteinas === 'object') {
        const prots = Object.entries(item.proteinas).filter(([_, q]) => q > 0);
        if (prots.length > 0) {
          html += `<div class="category-title">Proteínas:</div>`;
          prots.forEach(([id, q]) => { html += `<div class="sub-item">- ${q}x ${getName(menu?.proteinas, id)}</div>`; });
        }
      }
      if (item.toppings && typeof item.toppings === 'object') {
        const tops = Object.entries(item.toppings).filter(([_, q]) => q > 0);
        if (tops.length > 0) {
          html += `<div class="category-title">Toppings:</div>`;
          tops.forEach(([id, q]) => { html += `<div class="sub-item">- ${q}x ${getName(menu?.toppings, id)}</div>`; });
        }
      }
      if (item.salsas && typeof item.salsas === 'object') {
        const sals = Object.keys(item.salsas);
        if (sals.length > 0) {
          html += `<div class="category-title">Salsas:</div>`;
          sals.forEach((id) => { html += `<div class="sub-item">- 1x ${getName(menu?.salsas, id)}</div>`; });
        }
      }
      if (item.combo) {
        html += `<div class="category-title">Combo Incluido:</div>`;
        if (item.comboBebidaId) html += `<div class="sub-item">- Bebida: ${getName(menu?.combo?.bebidas250 || menu?.bebidas, item.comboBebidaId)}</div>`;
        if (item.comboSnackId) html += `<div class="sub-item">- Snack: ${getName(menu?.combo?.snacks, item.comboSnackId)}</div>`;
      }
    }
    html += `<div class="divider"></div>`; 
  });

  html += `
        <div class="item-row"><span>Subtotal:</span><span>$${fmt(pedido.subtotal)}</span></div>
        <div class="item-row"><span>Domicilio:</span><span>$${fmt(pedido.deliveryFee)}</span></div>
        ${pedido.pricing?.promoDiscount > 0 ? `<div class="item-row"><span>Descuento:</span><span>-$${fmt(pedido.pricing.promoDiscount)}</span></div>` : ''}
        <div class="divider"></div>
        <div class="item-row bold" style="font-size: 15px;"><span>TOTAL:</span><span>$${fmt(pedido.total)}</span></div>
        <div class="text-center" style="margin-top: 15px; font-style: italic;">"Gracias por tu compra"</div>
      </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  const frameDoc = iframe.contentWindow.document;
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();
  iframe.onload = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
  };
};


  // ─── Helpers vigencia códigos ─────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (ms) => {
  if (!ms && ms !== 0) return "";
  const d = new Date(Number(ms));
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
// "YYYY-MM-DD" -> ms (inicio del día local)
const toMs = (val) => {
  if (!val) return undefined;
  const [y, m, d] = String(val).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  return dt.getTime();
};

// Lee percent de un valor que puede ser número u objeto { percent, startAt, endAt }
const readPercent = (v) => (typeof v === "object" && v ? Number(v.percent || 0) || 0 : Number(v || 0) || 0);
const readStartStr = (v) => (typeof v === "object" && v?.startAt ? ymd(v.startAt) : "");
const readEndStr   = (v) => (typeof v === "object" && v?.endAt   ? ymd(v.endAt)   : "");


  // Modal de detalle
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);
  const openDetail = (p) => {
    setDetailOrder(p);
    setDetailOpen(true);
  };

  // Card de pedido (incluye badge mayorista y puntos)
  function PedidoCard({ p }) {
    const id         = p?.id || "—";
    const nombre     = p?.entrega?.nombre || "";
    const telefono   = p?.entrega?.telefono || "";
    const direccion  = p?.entrega?.direccion || "";
    const metodoPago = p?.entrega?.metodoPago || "—";
    const modo       = p?.entrega?.modo || "—";
    const total      = fmtMoney(p?.total || 0);

    const isMayorista = p?.pricing?.mayorista || p?.userRole === "mayorista";
    const points = Number(p?.pointsEarned || 0);
    const subtotalShow = Number(p?.pricing?.subtotal || 0);
    const totalShow = Number(p?.pricing?.total || p?.total || 0);
    const promoDisc = Number(p?.pricing?.promoDiscount || 0);
    const mayDisc = Number(p?.pricing?.mayoristaDiscount || 0);

    return (
      <>
      <div className="border rounded-xl p-4 bg-white flex flex-col justify-between shadow-sm hover:shadow-md transition">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-gray-500">#{id}</div>
            <div className="font-semibold flex items-center gap-2">
              {nombre}
              {isMayorista && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Mayorista -20%
                </span>
              )}
            </div>
            <div className="text-sm text-gray-700">{telefono}</div>
            <div className="text-sm text-gray-700">{direccion}</div>
            <div className="text-sm text-gray-700">Modo: <b>{modo}</b></div>
            <div className="text-sm">Pago: <b>{metodoPago}</b></div>
            {metodoPago === "Crédito convenio" && (
              <div className="mt-1 inline-flex items-center gap-2 text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                Crédito convenio
                {p?.convenio?.entidad?.nombre && <span>· {p.convenio.entidad.nombre}</span>}
              </div>
            )}
            <div className="text-xs text-gray-500 mt-1">
              Creado: {fmtDateTimeBogota(p?.createdAt)}
            </div>

            {(promoDisc > 0 || mayDisc > 0) && (
              <div className="mt-2 text-xs text-gray-700 space-y-0.5">
                <div>Subtotal: $ {fmtMoney(subtotalShow)}</div>
                {promoDisc > 0 && <div>Descuento promo: -$ {fmtMoney(promoDisc)}</div>}
                {mayDisc > 0 && <div>Descuento mayorista: -$ {fmtMoney(mayDisc)}</div>}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Total</div>
            <div className="text-xl font-bold">$ {fmtMoney(totalShow || total)}</div>
            {points > 0 && (
              <div className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                +{points} pts
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => openDetail(p)}
            className="text-sm px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Ver detalle
          </button>
   <div className="flex gap-2">
            <button
              onClick={() => updatePedidoStatus(id, "En camino")}
              className="text-sm px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              En camino
            </button>
            <button
              onClick={() => completePedido(id)}
              className="text-sm px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
            >
              Completado
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
 
  // Resolución de Barrio
  const barriosCat = Array.isArray(menu?.barrios) ? menu.barrios : (Array.isArray(menu?.settings?.barrios) ? menu.settings.barrios : []);

  let entregaBarrio = "—";
  if (typeof entregaBarrioRaw === "string" && entregaBarrioRaw) {
    const found = barriosCat.find(b => b.id === entregaBarrioRaw || b.name === entregaBarrioRaw);
    entregaBarrio = found?.name || entregaBarrioRaw;
  }


  // Formateador de dinero seguro
  const money = (val) => typeof fmtMoney === 'function' ? fmtMoney(val) : val;

// ==========================================
// COMPONENTE: DetailBody (Detalle del pedido)
// ==========================================


  return (
    <>
    {/* ====== BARRA DE NAVEGACIÓN RÁPIDA (STICKY) ====== */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider hidden sm:block">
            Ir a la tienda:
          </span>
          
          <Link 
            to="/" 
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            🏠 Inicio (Homesplit)
          </Link>
          
          <Link 
            to="/cliente" 
            className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-emerald-100"
          >
            🥗 Bowls
          </Link>
          
          <Link 
            to="/fruver" 
            className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-orange-100"
          >
            🍎 Frutas y Verduras
          </Link>
          <Link 
            to="/parfaits" 
            className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-orange-100"
          >
            🧋 Parfait's
          </Link>
        </div>
      </div>
      {/* ================================================== */}
      {/* ====== MENÚ SUPERIOR RESPONSIVE ====== */}
      <nav className="sticky top-0 z-[1100] bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <a href="#top" className="font-semibold tracking-tight">Intranet</a>
        </div>
      </nav>

      <div id="top" className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* 💄 Estilos locales */}
        <style>{`
          .admin-img-frame{
            position:relative; width:100%; aspect-ratio:16/9;
            background:#f3f4f6; border-radius:0.75rem; padding:0.5rem;
            display:flex; align-items:center; justify-content:center; overflow:hidden;
          }
          .admin-img-frame img{ width:100%; height:100%; object-fit:contain; }
          @media (max-width: 640px){ .admin-img-frame{ aspect-ratio:4/3; } }

          /* Índice lateral */
          .toc a { display:block; padding:.375rem .5rem; border-radius:.5rem; font-size:.875rem; }
          .toc a:hover { background: rgba(0,0,0,.04); }
          .card { border-radius: .75rem; border: 1px solid rgb(229 231 235); background: white; }
          .card-h { display:flex; align-items:center; justify-content:space-between; padding: .875rem 1rem; border-bottom: 1px solid rgb(229 231 235); }
          .section-gap { margin-top: 1.25rem; }
        `}</style>

        {/* audio ding */}
        <audio ref={audioRef} src="/ding.mp3" preload="auto" />



        {/* Banner tienda abierta/cerrada */}
        {!openStore ? (
          <div className="rounded-xl p-4 bg-red-50 border border-red-200 text-red-800 mb-4">
            <div className="text-lg font-semibold">
              La tienda está cerrada {override ? "(manual)" : "(automático)"}
            </div>
            <div className="text-sm">Zona: {BOGOTA_TZ}</div>
          </div>
        ) : (
          <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 mb-4">
            <div className="text-lg font-semibold">
              La tienda está abierta {override ? "(manual)" : "(automático)"}
            </div>
            <div className="text-sm">Zona: {BOGOTA_TZ}</div>
          </div>
        )}

        {/* Encabezado principal */}
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Intranet · Pedidos</h1>
          <div className="text-sm text-gray-500">({openStore ? "Abierto" : "Cerrado"} · {BOGOTA_TZ})</div>
        </header>

        {/* ===== Layout con Índice + Contenido ===== */}
        <div className="grid lg:grid-cols-[260px,1fr] gap-4 lg:gap-6">
          {/* Índice lateral (desktop) */}
          <aside className="hidden lg:block sticky top-20 self-start">
            <div className="card p-3 toc">
              <div className="text-xs font-semibold text-gray-500 uppercase px-2 mb-1">Índice</div>

              <a href="#horarios">Horario y estado de tienda</a>
              <a href="#pedidos">Pedidos (pendientes / histórico)</a>
              <a href="#editor-menu">Editor de menú</a>
              <a href="#bebidas-categorias">Bebidas · Categorías</a>
              <a href="#promos">Promociones</a>
              <a href="#promo-codes">Códigos promocionales</a>
              <a href="#temporada">Fruver · Temporada</a>
              <a href="#combo">Combo</a>
              <a href="#fruver-admin">Fruver </a>                
              <a href="#fruver-precios">Fruver · Carga masiva</a>
              {role === "admin" && (
                <>
                  <a href="#home">Inicio (HomeSplit)</a>

                  <a href="#wa">Mensajes WhatsApp</a>
                  <a href="#usuarios">Usuarios y permisos</a>
                </>
              )}
            </div>
          </aside>

          {/* Contenido principal */}
          <main className="space-y-6">
            {/* Índice plegable (mobile) */}
            <details className="lg:hidden card">
              <summary className="card-h cursor-pointer">Índice</summary>
              <div className="p-3 toc">
                <a href="#pedidos">Pedidos (pendientes / histórico)</a>
                <a href="#horarios">Horario y estado de tienda</a>
                <a href="#editor-menu">Editor de menú</a>
                {role === "admin" && (
                  <>
                    <a href="#home">Inicio (HomeSplit)</a>
                    <a href="#promos">Promociones</a>
                    <a href="#promo-codes">Códigos promocionales</a>
                    <a href="#bebidas-categorias">Bebidas · Categorías</a>
                    <a href="#temporada">Fruver · Temporada</a>
                    <a href="#combo">Combo</a>
                    <a href="#fruver-admin">Fruver · Productos</a>
                    <a href="#fruver-precios">Fruver · Carga masiva</a>
                    <a href="#wa">Mensajes WhatsApp</a>
                    <a href="#usuarios">Usuarios y permisos</a>
                  </>
                )}
              </div>
            </details>



            {/* ======= Horario / Control manual ======= */}

           {/* ADENTRO DEL RETURN DE INTRANET */}
            <AccordionCard id="horarios" title="Horario de la tienda (Bogotá)">
              {tienePermiso("horarios") ? (
                <EditorHorarios 
                  storeHours={storeHours} 
                  setStoreHours={setStoreHours} 
                  saveStoreHours={saveStoreHours} 
                  setManualOverride={setManualOverride} 
                />
              ) : (
                <div className="text-sm text-gray-500">Solo los administradores pueden editar el horario.</div>
              )}
            </AccordionCard>

            {tienePermiso("storage-images") && (
              <AccordionCard id="store-images" title="🖼️ Imágenes de la tienda (Gastro, Fruver y Parfaits)">
                <EditorStoreImages menu={menu} setMenu={setMenu} />
              </AccordionCard>
            )}

            {tienePermiso("pedidos") && (
                <AccordionCard
                  id="pedidos"
                  title="Pedidos (pendientes / histórico)"
                  aside={
                    <span className="text-sm text-gray-500">
                      {pedidosPendientes.length} pend. · {pedidosHistorico.length} hist.
                    </span>
                  }
                >
                  <ListaPedidos 
                    pedidosPendientes={pedidosPendientes} 
                    pedidosHistorico={pedidosHistorico} 
                    PedidoCard={PedidoCard} 
                  />
                </AccordionCard>
              )}

            {/* ========================================================== */}
            {/* 1. GESTIÓN DE PARFAITS Y OPCIONES                          */}
            {/* ========================================================== */}
          {tienePermiso("gestion-parfaits") && (
            <AccordionCard id="gestion-parfaits" title="🍨 Catálogo de Parfaits">
              <EditorPrecioParfait menu={menu} setMenu={setMenu} />
              <EditorFrutasParfait menu={menu} setMenu={setMenu} />
              <EditorParfaits menu={menu} setMenu={setMenu} />
            </AccordionCard>
          )}

          
            {/* ======= Editor de menú (ancla general) ======= */}
            <div id="editor-menu" />
              {tienePermiso("identidad") && (
                <AccordionCard id="identidad" title="Identidad y Portada">
                  <EditorIdentidad menu={menu} setMenu={setMenu} />
                </AccordionCard>
            )}



            {tienePermiso("barrios") && (
              <AccordionCard id="barrios" title="Zonas / Barrios (domicilios)">
                <EditorBarrios menu={menu} setMenu={setMenu} slugify={slugify} />
              </AccordionCard>
            )}

            {tienePermiso("bowls-editor") && (
              <AccordionCard id="bowls-editor" title="Bowls">
                <EditorBowls menu={menu} setMenu={setMenu} slugify={slugify} />
              </AccordionCard>
            )}


            {tienePermiso("proteinas-editor") && (
              <AccordionCard id="proteinas-editor" title="Proteínas">
                <EditorProteinas menu={menu} setMenu={setMenu} slugify={slugify} />
              </AccordionCard>
            )}

            {tienePermiso("toppings-editor") && (
              <AccordionCard id="toppings-editor" title="Toppings">
                <EditorToppings menu={menu} setMenu={setMenu} slugify={slugify} />
              </AccordionCard>
            )}

            {tienePermiso("salsas-editor") && (
              <AccordionCard id="salsas-editor" title="Salsas">
                <EditorSalsas menu={menu} setMenu={setMenu} slugify={slugify} />
              </AccordionCard>
            )}

            {tienePermiso("bebidas-editor") && (
              <AccordionCard id="bebidas-editor" title="Bebidas">
                <EditorBebidas menu={menu} setMenu={setMenu} slugify={slugify} />
              </AccordionCard>
            )}

            {/* ======= HomeSplit ======= */}
            {tienePermiso("home") && (
              <AccordionCard id="home" title="🏠 Inicio (HomeSplit): imágenes y opacidad">
                <EditorHomeSplit menu={menu} setMenu={setMenu} />
              </AccordionCard>
            )}

        {/* ========================================================== */}
        {/* PROMOCIONES Y DESCUENTOS                                   */}
        {/* ========================================================== */}
        {tienePermiso("promo") && (
          <AccordionCard id="promo" title="🎁 Promociones y Descuentos">
            <EditorPromos menu={menu} setMenu={setMenu} db={db} />
          </AccordionCard>
        )}
        {/* ========================================================== */}
        {/* CÓDIGOS PROMOCIONALES (SISTEMA NUEVO)                      */}
        {/* ========================================================== */}
        {tienePermiso("promo-codes") && (
          <AccordionCard id="promo-codes" title="🎟️ Códigos Promocionales">
            <div className="flex justify-end mb-4">
              {/* El botón de agregar lo maneja el componente por dentro, pero podemos dejar un header limpio */}
            </div>
            <EditorPromoCodes menu={menu} setMenu={setMenu} db={db} />
          </AccordionCard>
        )}
        {/* ========================================================== */}
        {/* MÓDULO DE USUARIOS Y PERMISOS                              */}
        {/* ========================================================== */}
        {tienePermiso("staff-users") && (
          <AccordionCard
            id="staff-users"
            title="👥 Gestión de Usuarios y Permisos"
          >
            <div className="flex justify-end mb-4">
              {/* Usamos un pequeño truco para llamar a la función addStaffMember pasándole una referencia, o dejamos el botón adentro del componente (lo dejé en el componente pero puedes ajustar el diseño). */}
            </div>
            <EditorStaff menu={menu} setMenu={setMenu} db={db} adminModules={adminModules} />
          </AccordionCard>
        )}

          {tienePermiso("temporada") && (
            <AccordionCard
              id="temporada"
              title="Fruver · Productos de temporada"
              aside={
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Aparecen en el carrusel de la tienda
                </span>
              }
            >
              <EditorTemporada menu={menu} setMenu={setMenu} />
            </AccordionCard>
          )}

              
           

            {/* ======= Combo ======= */}
            {tienePermiso("combo") && (
              <AccordionCard id="combo" title="Combo: precio, bebidas 250 ml y snacks">
                <EditorCombo menu={menu} setMenu={setMenu} />
              </AccordionCard>
            )}

            {tienePermiso("bebidas-categorias") && (
              <AccordionCard
                id="bebidas-categorias"
                title="Bebidas · Categorías"
              >
                <EditorBebidasCategorias menu={menu} setMenu={setMenu} slugify={slugify} />
              </AccordionCard>
            )}


            {tienePermiso("fruver-admin") && (
              <AccordionCard
                id="fruver-admin"
                title="Fruver"
              >
                <EditorFruver menu={menu} setMenu={setMenu} slugify={slugify} />
              </AccordionCard>
            )}

            {tienePermiso("wa") && (
              <AccordionCard id="wa" title="Mensajes de WhatsApp">
                <EditorWhatsApp menu={menu} setMenu={setMenu} />
              </AccordionCard>
            )}
            
            {tienePermiso("fruver-precios") && (
              <AccordionCard
                id="fruver-precios"
                title="Fruver · Precios (CSV mínimo)"
                aside={
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Rápido y simple
                  </span>
                }
              >
                <EditorFruverBulk menu={menu} setMenu={setMenu} />
              </AccordionCard>
            )}
              


            {/* ======= Mensajes WhatsApp ======= */}
             
</main >
</div>
</div>
{/* Modal de detalle */}
<Modal
  open={detailOpen}
  onClose={() => setDetailOpen(false)}
  title={detailOrder ? `Pedido #${detailOrder.id}` : "Detalle de pedido"}
>
  {detailOrder && (
    <button 
      onClick={() => imprimirComanda(detailOrder, menu)} 
      className="w-full mb-4 px-4 py-3 bg-gray-800 text-white font-bold rounded-lg shadow-md hover:bg-black flex justify-center items-center gap-2"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 00-2 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
      </svg>
      Imprimir Comanda (58mm)
    </button>
  )}

  {/* AQUÍ ESTÁ EL CAMBIO: 
      Pasamos 'menu' para que el componente pueda leer las categorías y plantillas 
  */}
  <DetailBody p={detailOrder} menu={menu} /> 
</Modal>
</>
  );
}


// ==========================================
// COMPONENTE: DetailBody (Detalle del pedido)
// ==========================================
const DetailBody = ({ p, menu }) => {
  if (!p) return <div className="p-8 text-center text-gray-500 font-bold">Selecciona un pedido.</div>;

  // 1. Funciones de ayuda seguras
  const money = (val) => (Number(val) || 0).toLocaleString("es-CO");
  
  // 2. Extraer catálogos del menú (UNIFICADOS PARA BUSCAR MEJOR)
  const allProducts = [...(menu?.gastro || []), ...(menu?.bowls || []), ...(menu?.parfaits || [])];
  const proteCat = menu?.proteinas || [];
  const toppCat = menu?.toppings || [];
  const salsaCat = menu?.salsas || [];
  const bebidasCat = menu?.bebidas || [];
  const comboBebidas = menu?.combo?.bebidas || menu?.combo?.bebidas250 || [];
  const comboSnacks = menu?.combo?.snacks || [];

  // 3. Funciones TRADUCTORAS
  const formatSelected = (obj, catalog) => {
    if (!obj || typeof obj !== 'object') return "";
    return Object.entries(obj)
      .filter(([_, val]) => val)
      .map(([id, val]) => {
         const name = catalog?.find(c => c.id === id)?.name || id;
         return typeof val === 'number' && val > 1 ? `${val}x ${name}` : name;
      }).join(", ");
  };

  const getNameById = (id, catalog) => {
    if (!id) return "";
    return catalog?.find(c => c.id === id)?.name || id;
  };

  // 4. Variables Generales
  const subtotalShow = Number(p?.pricing?.subtotal || p?.subtotal || 0);
  const totalShow = Number(p?.pricing?.total || p?.total || 0);
  const promoDisc = Number(p?.pricing?.promoDiscount || 0);
  const mayDisc = Number(p?.pricing?.mayoristaDiscount || 0);
  const isMayorista = p?.pricing?.mayorista || p?.userRole === "mayorista";

  const isFruver = p?.type === "fruver";
  const isParfait = p?.type === "parfaits";
  const items = Array.isArray(p?.items) ? p.items : [];
  const entregaBarrio = p?.entrega?.barrio || p?.entrega?.barrioName || p?.entrega?.barrioId || "—";

  // 5. WhatsApp
  const templates = menu?.waTemplates || {};
  const phone = p?.entrega?.telefono || "";

  const renderWA = (text) => {
    if (!text) return "";
    return text
      .replace(/{{nombre}}/g, p?.entrega?.nombre || "Cliente")
      .replace(/{{orderId}}/g, p?.id?.slice(-5) || "—")
      .replace(/{{total}}/g, money(totalShow))
      .replace(/{{direccion}}/g, p?.entrega?.direccion || "—")
      .replace(/{{metodoPago}}/g, p?.entrega?.metodoPago || "—");
  };

  const waConfirm = `https://wa.me/57${phone}?text=${encodeURIComponent(renderWA(templates.newOrder))}`;
  const waOnWay   = `https://wa.me/57${phone}?text=${encodeURIComponent(renderWA(templates.outForDelivery))}`;
  const waReady   = `https://wa.me/57${phone}?text=${encodeURIComponent(renderWA(templates.readyForPickup))}`;

  return (
    <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-2 pb-4">
      {/* Header Cliente/Entrega */}
      <div className="grid md:grid-cols-2 gap-4 pt-1 border-b border-gray-100 pb-4">
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cliente</div>
          <div className="font-bold text-gray-800 flex items-center gap-2">
            {p?.entrega?.nombre || "—"}
            {isMayorista && <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold">MAYORISTA</span>}
          </div>
          <div className="text-sm text-gray-600">{p?.entrega?.telefono || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Entrega</div>
          <div className="text-sm"><b>{p?.entrega?.modo || "—"}</b> en {entregaBarrio}</div>
          <div className="text-sm text-gray-600 truncate">{p?.entrega?.direccion || "—"}</div>
          <div className="text-xs font-bold text-emerald-700 mt-1 uppercase">Pago: {p?.entrega?.metodoPago || "—"}</div>
        </div>
      </div>

      {/* Items */}
      <div className="pt-2">
        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Productos</div>
        <ul className="space-y-3">
          {items.map((it, i) => {
            
            // --- BÚSQUEDA INTELIGENTE DEL NOMBRE DEL BOWL ---
            let itemName = it?.name || it?.bowlName || it?.bowlId || "Producto";
            
            // Si parece un código de Firebase (sin espacios y largo) o si tenemos un ID:
            if ((typeof itemName === 'string' && itemName.length > 15 && !itemName.includes(" ")) || it?.bowlId || it?.id) {
               const searchId = (itemName.length > 15 && !itemName.includes(" ")) ? itemName : (it?.bowlId || it?.id);
               const realProduct = allProducts.find(c => c.id === searchId);
               
               if (realProduct && realProduct.name) {
                   itemName = realProduct.name; // Encontramos el nombre real en el menú
               } else if (typeof itemName === 'string' && itemName.length > 15) {
                   itemName = isParfait ? "Parfait Personalizado" : "Bowl Personalizado"; // Fallback si el bowl ya no existe en el menú
               }
            }

            const itemPrice = it?.lineTotal || it?.subtotal || (it?.price * (it?.qty || 1)) || 0;

            return (
              <li key={i} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-gray-800 text-sm">{it?.qty || 1}x {itemName}</span>
                  <span className="font-bold text-gray-600 text-[12px]">$ {money(itemPrice)}</span>
                </div>
                
                {/* LÓGICA PARA GASTRO / BOWLS */}
                {!isFruver && !isParfait && (
                  <div className="text-[11px] text-gray-500 mt-1 space-y-1 ml-1 border-l-2 border-emerald-100 pl-2">
                    {it.proteinas && Object.keys(it.proteinas).length > 0 && <div>🍗 {formatSelected(it.proteinas, proteCat)}</div>}
                    {it.toppings && Object.keys(it.toppings).length > 0 && <div>🥗 {formatSelected(it.toppings, toppCat)}</div>}
                    {it.salsas && Object.keys(it.salsas).length > 0 && <div>🧂 {formatSelected(it.salsas, salsaCat)}</div>}
                    
                    {it.bebidaId && <div className="text-emerald-700 font-semibold mt-1">🥤 Bebida: {getNameById(it.bebidaId, bebidasCat)}</div>}
                    
                    {it.combo && (
                      <div className="mt-2 bg-emerald-50 rounded p-1.5 border border-emerald-100 inline-block">
                        <div className="font-bold text-emerald-700">⭐ Combo Activo</div>
                        <div className="text-[10px] text-gray-600 mt-0.5">
                          {getNameById(it.comboBebidaId, comboBebidas)} 
                          {it.comboSnackId && ` • ${getNameById(it.comboSnackId, comboSnacks)}`}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* LÓGICA PARA PARFAITS */}
                {isParfait && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    <div className="italic">🥛 {it?.yogurt || "Yogurt"} • 🌾 {it?.granola || "Granola"}</div>
                    
                    {Array.isArray(it?.excludedFruits) && it.excludedFruits.length > 0 && (
                      <div className="mt-2 text-red-600 font-bold text-[10px] bg-red-50 px-2 py-1 rounded border border-red-100 inline-flex items-center gap-1">
                        <span>❌ SIN:</span><span className="uppercase">{it.excludedFruits.join(", ")}</span>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Totales */}
      <div className="pt-4 border-t border-dashed border-gray-200 space-y-1">
        <div className="flex justify-between items-center pt-2">
          <span className="font-black text-gray-800 text-sm">TOTAL A COBRAR:</span>
          <span className="text-2xl font-black text-emerald-600">$ {money(totalShow)}</span>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-6 sticky bottom-0 bg-white border-t mt-4">
        <a href={waConfirm} target="_blank" rel="noreferrer" className="bg-emerald-600 text-white p-3 rounded-xl text-center font-bold text-[11px] shadow-sm uppercase hover:bg-emerald-700">Confirmar</a>
        <a href={waOnWay} target="_blank" rel="noreferrer" className="bg-sky-600 text-white p-3 rounded-xl text-center font-bold text-[11px] shadow-sm uppercase hover:bg-sky-700">En Camino</a>
        <a href={waReady} target="_blank" rel="noreferrer" className="bg-amber-600 text-white p-3 rounded-xl text-center font-bold text-[11px] shadow-sm uppercase hover:bg-amber-700">Recoger</a>
      </div>
    </div>
  );
};