// src/pages/Intranet.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePedido } from "../context/PedidoContext";
import FruverBulkPricesLite from "../components/FruverBulkPricesLite.jsx";
import { Link } from "react-router-dom";


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

import { db } from "../firebase.js"; // ← ajusta la ruta si tu archivo es distinto




/* =========================
   Zona horaria: America/Bogota
   ========================= */
const BOGOTA_TZ = "America/Bogota";

// helpers de fecha/hora en Bogotá
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
function AccordionCard({ id: sectionId, title, children, defaultOpen = false, aside }) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section id={sectionId} className="card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="card-h cursor-pointer w-full text-left"
        aria-expanded={open}
        aria-controls={sectionId ? `${sectionId}-panel` : undefined}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-3">
          {aside}
          <span
            className={`inline-block transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </div>
      </button>

      {open && (
        <div id={sectionId ? `${sectionId}-panel` : undefined} className="p-4">
          {children}
        </div>
      )}
    </section>
  );
}



/* ============== Página Intranet ============== */
export default function Intranet() {

const fmtMoney = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n || 0));

function makeRange(fromStr, toStr) {
  if (!fromStr && !toStr) return {};
  let startTs, endTs;
  if (fromStr) startTs = Timestamp.fromDate(new Date(fromStr + "T00:00:00"));
  if (toStr)   endTs   = Timestamp.fromDate(new Date(toStr + "T23:59:59"));
  return { startTs, endTs };
}

  const {
    role,
    menu,
    setMenu,
    pedidosPendientes,
    pedidosHistorico,
    updatePedidoStatus,
    completePedido,
  } = usePedido();

  const initialIdentity = useMemo(() => ({
    logoUrl: menu?.logoUrl || "",
    logoSize: menu?.settings?.logoSize || 80,
    footerLogoUrl: menu?.footerLogoUrl || "",
    heroUrl: menu?.heroUrl || "",
    tagline: menu?.tagline || "",
    bgColor: menu?.settings?.bgColor || "#f9f8f1",
    primaryColor: menu?.settings?.primaryColor || "#10624c",
  }), [menu?.logoUrl, menu?.footerLogoUrl, menu?.heroUrl, menu?.tagline, menu?.settings?.bgColor, menu?.settings?.primaryColor]);

  const [identityCfg, setIdentityCfg] = useState(initialIdentity);

  /* 2. Efecto para actualizar cuando carga Firebase */
  useEffect(() => {
    setIdentityCfg(initialIdentity);
  }, [initialIdentity]);

  /* 3. Función de Guardado */
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

  // ===== Admins (emails) =====
  const initialAdmins = useMemo(
    () => (Array.isArray(menu?.settings?.adminEmails) ? menu.settings.adminEmails : []),
    [menu?.settings?.adminEmails]
  );
  const [adminsText, setAdminsText] = useState(initialAdmins.join("\n"));
  useEffect(() => {
    setAdminsText((Array.isArray(menu?.settings?.adminEmails) ? menu.settings.adminEmails : []).join("\n"));
  }, [menu?.settings?.adminEmails]);

  const saveAdmins = async () => {
    const emails = Array.from(
      new Set(
        (String(adminsText)
          .split(/[\n,]/g)
          .map(s => s.trim())
          .filter(Boolean)
          .map(e => e.toLowerCase())) // normaliza
      )
    );
    const next = {
      ...(menu || {}),
      settings: {
        ...(menu?.settings || {}),
        adminEmails: emails,
      },
    };
    await setMenu(next);
    alert("Administradores actualizados ✅");
  };

  // === Temporada (lista de IDs) ===
  const initialSeasonal = useMemo(
    () => (Array.isArray(menu?.settings?.fruverSeasonal) ? menu.settings.fruverSeasonal : []),
    [menu?.settings?.fruverSeasonal]
  );
  const [seasonalIDs, setSeasonalIDs] = useState(initialSeasonal);
  useEffect(() => setSeasonalIDs(initialSeasonal), [initialSeasonal]);

  const toggleSeasonal = (id) => {
    setSeasonalIDs((prev) =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const saveSeasonal = async () => {
    const next = {
      ...(menu || {}),
      settings: {
        ...(menu?.settings || {}),
        fruverSeasonal: Array.from(new Set(seasonalIDs)),
      },
    };
    await setMenu(next);
    alert("Productos de temporada guardados ✅");
  };

  /* ====== Editor HomeSplit (imagenes + opacidad) ====== */
  const initialHome = useMemo(() => {
    return {
      heroUrl: menu?.heroUrl || "",
      heroFruverUrl: menu?.heroFruverUrl || "",
      overlay: Number(menu?.settings?.homeOverlayOpacity ?? 0.6),
    };
  }, [menu?.heroUrl, menu?.heroFruverUrl, menu?.settings?.homeOverlayOpacity]);

  const [home, setHome] = useState(initialHome);
  useEffect(() => setHome(initialHome), [initialHome]);

  const saveHome = async () => {
    const overlayClamped = Number.isFinite(Number(home.overlay))
      ? Math.max(0, Math.min(1, Number(home.overlay)))
      : 0.6;

    const next = {
      ...(menu || {}),
      heroUrl: home.heroUrl || "",
      heroFruverUrl: home.heroFruverUrl || "",
      settings: {
        ...(menu?.settings || {}),
        homeOverlayOpacity: overlayClamped,
      },
    };
    await setMenu(next);
    alert("Portada guardada ✅");
  };
  /* ====== Editor Identidad y Portada (CORREGIDO) ====== */
  
  /* ====== Editor de Combo (precio + bebidas 250ml + snacks) ====== */
  const initialCombo = useMemo(() => {
    const c = menu?.combo || {};
    return {
      price: Number(c?.price ?? 7000),
      bebidas250: Array.isArray(c?.bebidas250) ? c.bebidas250 : [],
      snacks: Array.isArray(c?.snacks) ? c.snacks : [],
    };
  }, [menu?.combo]);

  const [comboForm, setComboForm] = useState(initialCombo);
  useEffect(() => setComboForm(initialCombo), [initialCombo]);

  // Texto crudo en textareas (permite enter y comas sin limpiarse al escribir)
  const [bebidasText, setBebidasText] = useState(() =>
    (initialCombo.bebidas250 || []).map(o => o?.name || "").join("\n")
  );
  const [snacksText, setSnacksText] = useState(() =>
    (initialCombo.snacks || []).map(o => o?.name || "").join("\n")
  );
  useEffect(() => {
    setBebidasText((initialCombo.bebidas250 || []).map(o => o?.name || "").join("\n"));
    setSnacksText((initialCombo.snacks || []).map(o => o?.name || "").join("\n"));
  }, [initialCombo]);

  const saveCombo = async () => {
    const toList = (text) => splitLinesOrCommas(text).map((name) => ({ id: slugify(name), name }));
    const next = {
      ...(menu || {}),
      combo: {
        price: Number(comboForm.price || 0) || 0,
        bebidas250: toList(bebidasText),
        snacks: toList(snacksText),
      },
    };
    await setMenu(next);
    alert("Combo guardado ✅");
  };

  /* ====== Categorías de Bebidas (CRUD + asignación) ====== */
  const initialBebCats = useMemo(() => {
    return Array.isArray(menu?.beveragesCategories) ? menu.beveragesCategories : [];
  }, [menu?.beveragesCategories]);

  const [bebCats, setBebCats] = useState(initialBebCats);
  useEffect(() => setBebCats(initialBebCats), [initialBebCats]);

  const bebidasCatalog = Array.isArray(menu?.bebidas) ? menu.bebidas : [];

  const addBebCat = () => {
    const id = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    setBebCats((p) => [...p, { id, name: "Nueva categoría", beverageIds: [] }]);
  };
  const removeBebCat = (id) => setBebCats((p) => p.filter((c) => c.id !== id));
  const updBebCat = (idx, patch) =>
    setBebCats((p) => {
      const next = [...p];
      next[idx] = { ...(next[idx] || {}), ...patch };
      return next;
    });

  const toggleBeverageInCat = (idx, bevId) => {
    setBebCats((p) => {
      const next = [...p];
      const setIds = new Set(next[idx]?.beverageIds || []);
      if (setIds.has(bevId)) setIds.delete(bevId);
      else setIds.add(bevId);
      next[idx] = { ...(next[idx] || {}), beverageIds: Array.from(setIds) };
      return next;
    });
  };

  // ===== Reordenar categorías (por índice del array) =====
  const moveCat = (from, to) => {
    setBebCats((prev) => {
      const next = [...prev];
      if (to < 0 || to >= next.length) return prev;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const moveUpCat = (idx) => moveCat(idx, idx - 1);
  const moveDownCat = (idx) => moveCat(idx, idx + 1);

  const saveBeverageCategories = async () => {
    const cleaned = (bebCats || []).map((c) => ({
      id: c.id || slugify(c.name || "cat"),
      name: String(c.name || "").trim() || "Categoría",
      beverageIds: Array.from(new Set(c.beverageIds || [])).filter(Boolean),
    }));
    const next = { ...(menu || {}), beveragesCategories: cleaned };
    await setMenu(next);
    alert("Categorías de bebidas guardadas ✅");
  };

  // Plantillas (editor admin)
  const initialTemplates = useMemo(() => {
    const fromDb = menu?.settings?.whatsappTemplates || {};
    return {
      newOrder: fromDb.newOrder || DEFAULT_TEMPLATES.newOrder,
      outForDelivery: fromDb.outForDelivery || DEFAULT_TEMPLATES.outForDelivery,
      readyForPickup: fromDb.readyForPickup || DEFAULT_TEMPLATES.readyForPickup,
      fruverNewOrder: fromDb.fruverNewOrder || DEFAULT_TEMPLATES.fruverNewOrder,
    };
  }, [menu?.settings?.whatsappTemplates]);
  const [templates, setTemplates] = useState(initialTemplates);
  useEffect(() => setTemplates(initialTemplates), [initialTemplates]);
  const saveTemplates = async () => {
    const next = {
      ...(menu || {}),
      settings: {
        ...(menu?.settings || {}),
        whatsappTemplates: { ...templates },
      },
    };
    await setMenu(next);
    alert("Plantillas guardadas ✅");
  };

  const initialDiscounts = useMemo(() => {
    const d = menu?.settings?.discounts || {};
    return {
      bowls: { ...(d?.bowls || {}) },
      fruver: { ...(d?.fruver || {}) },
    };
  }, [menu?.settings?.discounts]);

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


  // ====== Códigos Promocionales (mapa CODE -> % ) ======
const initialPromoCodes = useMemo(() => {
  return menu?.settings?.promoCodes || {};
}, [menu?.settings?.promoCodes]);

const [promoCodes, setPromoCodes] = useState(initialPromoCodes);
useEffect(() => setPromoCodes(initialPromoCodes), [initialPromoCodes]);

const addPromoCode = () => {
  const base = "CODIGO";
  let code = base;
  let i = 1;
  while (promoCodes[code]) code = `${base}${i++}`;
  setPromoCodes((m) => ({
    ...m,
    [code]: { percent: 10, startAt: undefined, endAt: undefined },
  }));
};


const setPromoValue = (code, value) => {
  const pct = Number(value || 0) || 0;
  setPromoCodes((m) => {
    const prev = m[code];
    if (typeof prev === "object" && prev) {
      return { ...m, [code]: { ...prev, percent: pct } };
    }
    return { ...m, [code]: { percent: pct } };
  });
};

const setPromoDate = (code, field, dateStr) => {
  setPromoCodes((m) => {
    const prev = m[code];
    const ms = toMs(dateStr);
    if (typeof prev === "object" && prev) {
      return { ...m, [code]: { ...prev, [field]: ms } };
    }
    // Si era un número, lo convertimos a objeto manteniendo el %:
    return { ...m, [code]: { percent: readPercent(prev), [field]: ms } };
  });
};


const renamePromoCode = (oldCode, newCode) => {
  const cleanOld = String(oldCode || "").trim().toUpperCase();
  const cleanNew = String(newCode || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!cleanOld) return;
  setPromoCodes((p) => {
    const next = { ...p };
    const val = next[cleanOld];
    delete next[cleanOld];
    if (cleanNew) next[cleanNew] = val;
    return next;
  });
};

const removePromoCode = (code) => {
  setPromoCodes((p) => {
    const next = { ...p };
    delete next[code];
    return next;
  });
};

const savePromoCodes = async () => {
  const now = Date.now();

  // Normaliza a { percent, startAt?, endAt? } y descarta inválidos o vencidos
  const cleanedEntries = Object.entries(promoCodes)
    .map(([code, val]) => {
      const percent = readPercent(val);
      const startAt = (typeof val === "object" && val?.startAt != null) ? Number(val.startAt) : undefined;
      const endAt   = (typeof val === "object" && val?.endAt   != null) ? Number(val.endAt)   : undefined;

      if (percent <= 0) return null;                 // % inválido
      if (endAt && endAt < now) return null;         // vencido
      if (startAt && endAt && endAt < startAt) return null; // rango inválido

      return [String(code).toUpperCase(), { percent, startAt, endAt }];
    })
    .filter(Boolean);

  const cleanedMap = Object.fromEntries(cleanedEntries);

  const next = {
    ...(menu || {}),
    settings: {
      ...(menu?.settings || {}),
      promoCodes: cleanedMap,
      promoCodesUpdatedAt: Date.now(),
    },
  };

  await setMenu(next);
  alert("Códigos promocionales guardados ✅ (vencidos eliminados)");
};





  const [discounts, setDiscounts] = useState(initialDiscounts);
  useEffect(() => {
    // solo sincroniza si realmente cambió
    const now = initialDiscounts;
    setDiscounts((prev) => {
      const a = JSON.stringify(prev);
      const b = JSON.stringify(now);
      return a === b ? prev : now;
    });
  }, [initialDiscounts]);

  // Form local para crear/editar una promo
  const [promoType, setPromoType] = useState("bowls"); // "bowls" | "fruver"
  const [promoProductId, setPromoProductId] = useState("");
  const [promoPercent, setPromoPercent] = useState(10);

  // util: nombre por id ya existe: nameById(list,id)
  const bowlsList = Array.isArray(menu?.bowls) ? menu.bowls : [];
  const fruverList = Array.isArray(menu?.fruver) ? menu.fruver : [];

  // Agregar / actualizar una promo
  const upsertPromo = () => {
    if (!promoProductId) { alert("Elige un producto"); return; }
    const pct = Math.max(0, Math.min(100, Number(promoPercent) || 0));
    setDiscounts((d) => {
      const next = {
        bowls: { ...(d?.bowls || {}) },
        fruver: { ...(d?.fruver || {}) },
      };
      next[promoType][promoProductId] = pct;
      return next;
    });
    alert("Promoción guardada en borrador (recuerda 'Guardar promociones')");
  };

// Quita promo tanto si fruver es objeto (map) como si es array
  // Eliminar promoción por tipo ("bowls" o "fruver")
  const removePromo = (type, id) => {
    setDiscounts((d) => {
      const next = {
        bowls: { ...(d?.bowls || {}) },
        fruver: { ...(d?.fruver || {}) },
      };
      if (next[type]) delete next[type][id];
      return next;
    });
  };

// Guardar promociones (persistir en Firestore) — PISA el bloque en DB
const saveDiscounts = async () => {
  // 1) Normaliza (ambos como MAPA: { id: % })
  const cleanMap = (obj = {}) =>
    Object.fromEntries(
      Object.entries(obj)
        .map(([id, v]) => [String(id || "").trim(), Math.max(0, Math.min(100, Number(v) || 0))])
        .filter(([_, v]) => v > 0)
    );

  const cleaned = {
    bowls: cleanMap(discounts?.bowls),
    fruver: cleanMap(discounts?.fruver),
  };

  // 2) PISA SOLO settings.discounts en Firestore (no merge)
  const menuRef = doc(db, "menu", "config"); // ajusta si tu doc es otro
  await updateDoc(menuRef, {
    "settings.discounts": cleaned,
    "settings.discountsUpdatedAt": Date.now(),
  });

  // 3) Refleja en UI EXACTAMENTE lo guardado (evita que “reviva”)
  setDiscounts(cleaned);

  alert("Promociones guardadas ✅");
};





  // Creador de un nuevo producto fruver (valores por defecto)
function newFruverItem() {
  return {
    id: crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
    name: "Nuevo producto",
    price: 0,
    unit: "lb",   // "lb" o "unidad"
    img: "",
    active: true, // por defecto aparece activo
  };
}



  const initialFruver = Array.isArray(menu?.fruver) ? menu.fruver : [];
  const [fruver, setFruver] = useState(initialFruver);
  const [fruverDirty, setFruverDirty] = useState(false);
  // Solo sincroniza desde Firestore si NO hay edición local en curso
useEffect(() => {
  if (!fruverDirty) {
    setFruver(Array.isArray(menu?.fruver) ? menu.fruver : []);
  }
}, [menu?.fruver, fruverDirty]);


  const addFruver = () =>
  setFruver((p) => {
    setFruverDirty(true);
    return [
      ...p,
      {
        id: crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
        name: "Nuevo producto",
        price: 0,
        unit: "lb",
        img: "",
        active: true,
      },
    ];
  });

  const removeFruver = (id) =>
  setFruver((p) => {
    setFruverDirty(true);
    return p.filter((x) => x.id !== id);
  });


  // Actualiza un producto fruver por ID (no por índice)
const updFruverById = (id, patch) =>
  setFruver((p) => {
    setFruverDirty(true);
    const idx = p.findIndex((x) => x?.id === id);
    if (idx < 0) return p;
    const next = [...p];
    next[idx] = { ...(next[idx] || {}), ...patch };
    return next;
  });



  const saveFruver = async () => {
    const cleaned = (fruver || []).map((x) => ({
      id: x.id || (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
      name: String(x.name || "").trim(),
      price: Number(x.price || 0) || 0,
      unit: x.unit === "unidad" ? "unidad" : "lb",
      img: String(x.img || ""),
      active: x.active !== false, // ← NUEVO: guarda el toggle (default true)
    }));

    const next = { ...(menu || {}), fruver: cleaned };
    await setMenu(next);
    setFruverDirty(false);
    alert("Fruver guardado ✅");
  };

  // Filtro de visualización (todos / activos / inactivos)
const [fruverFilter, setFruverFilter] = useState("all");

// Lista filtrada según 'active'
const fruverVisible = useMemo(() => {
  if (!Array.isArray(fruver)) return [];
  if (fruverFilter === "active")   return fruver.filter(it => it?.active !== false);
  if (fruverFilter === "inactive") return fruver.filter(it => it?.active === false);
  return fruver; // "all"
}, [fruver, fruverFilter]);

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
    );
  }

  // Render del detalle (modal)
// Render del detalle (modal)
const DetailBody = ({ p }) => {
  if (!p) return null;

  const telefonoIntl = normalizeIntlPhone(p?.entrega?.telefono || "");

  const confirmTpl = p?.type === "fruver" ? templates.fruverNewOrder : templates.newOrder;
  const msgConfirm = renderTemplate(confirmTpl, p, menu);
  const msgOnWay  = renderTemplate(templates.outForDelivery, p, menu);
  const msgReady  = renderTemplate(templates.readyForPickup, p, menu);

  const waConfirmURL = buildWhatsAppLink({ toPhoneIntl: telefonoIntl, message: msgConfirm });
  const waOnWayURL   = buildWhatsAppLink({ toPhoneIntl: telefonoIntl, message: msgOnWay });
  const waReadyURL   = buildWhatsAppLink({ toPhoneIntl: telefonoIntl, message: msgReady });

  const items        = p?.items || [];
  const isFruver     = p?.type === "fruver";
  const bebidasCat   = menu?.bebidas || [];
  const proteCat     = menu?.proteinas || [];
  const toppCat      = menu?.toppings  || [];
  const salsaCat     = menu?.salsas    || [];
  const comboBebidas = menu?.combo?.bebidas250 || [];
  const comboSnacks  = menu?.combo?.snacks || [];

  // === NUEVO: resolver nombre de barrio seleccionado ===
  const barriosCat =
    Array.isArray(menu?.barrios) ? menu.barrios :
    Array.isArray(menu?.settings?.barrios) ? menu.settings.barrios : [];

  const entregaBarrioRaw =
    p?.entrega?.barrio ??
    p?.entrega?.barrioId ??
    p?.entrega?.barrioSlug ??
    p?.entrega?.barrio_id ?? "";

  let entregaBarrio = "—";
  if (typeof entregaBarrioRaw === "string") {
    const byId = barriosCat.find(b => b.id === entregaBarrioRaw);
    const bySlugOrName = barriosCat.find(b =>
      (b?.slug && b.slug === entregaBarrioRaw) ||
      (b?.name && slugify(String(b.name)) === slugify(String(entregaBarrioRaw)))
    );
    entregaBarrio = byId?.name || bySlugOrName?.name || entregaBarrioRaw || "—";
  } else if (entregaBarrioRaw && typeof entregaBarrioRaw === "object") {
    entregaBarrio = entregaBarrioRaw?.name || nameById(barriosCat, entregaBarrioRaw?.id) || "—";
  }

  const subtotalShow = Number(p?.pricing?.subtotal || 0);
  const totalShow = Number(p?.pricing?.total || p?.total || 0);
  const promoDisc = Number(p?.pricing?.promoDiscount || 0);
  const mayDisc = Number(p?.pricing?.mayoristaDiscount || 0);
  const isMayorista = p?.pricing?.mayorista || p?.userRole === "mayorista";


  return (
    // ⬇️ Contenedor scrollable del detalle
    <div
      className="
        space-y-3
        max-h-[85vh] md:max-h-[88vh]
        overflow-y-auto overscroll-contain touch-pan-y
        pr-1
      "
    >
      {/* Header compacto */}
      <div className="grid md:grid-cols-2 gap-3 pt-1">
        <div>
          <div className="text-sm text-gray-500">Cliente</div>
          <div className="font-medium flex items-center gap-2">
            {p?.entrega?.nombre || "—"}
            {isMayorista && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                Mayorista -20%
              </span>
            )}
          </div>
          <div className="text-sm">{p?.entrega?.telefono || "—"}</div>
          {p?.pointsEarned > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 inline-block px-2 py-0.5 rounded border border-amber-200 mt-1">
              +{p.pointsEarned} pts
            </div>
          )}
        </div>
        <div>
          <div className="text-sm text-gray-500">Entrega</div>
          <div className="text-sm">Modo: <b>{p?.entrega?.modo || "—"}</b></div>
          <div className="text-sm">Dirección: {p?.entrega?.direccion || "—"}</div>
          <div className="text-sm">Barrio: {entregaBarrio}</div>
          <div className="text-sm">Pago: <b>{p?.entrega?.metodoPago || "—"}</b></div>
          {p?.entrega?.metodoPago === "Crédito convenio" && (
  <div className="text-sm">
    Convenio: <b>{p?.convenio?.entidad?.nombre || "—"}</b>
    {p?.convenio?.cedula ? <> · Cédula: {p.convenio.cedula}</> : null}
  </div>
)}

        </div>
      </div>

      {/* Items con título sticky para largas listas */}
      <div className="border-t pt-3">
        <div className="sticky top-0 -mt-3 pt-3 pb-2 bg-white/90 backdrop-blur-sm z-10">
          <div className="font-semibold">Items</div>
        </div>
        <ul className="space-y-2">
          {items.map((it, i) => {
            if (isFruver) {
              return (
                <li key={i} className="text-sm leading-5">
                  <div className="font-medium">#{i + 1} {it?.name}</div>
                  <div>
                    📦 {it?.qty} {it?.unit === "lb" ? "lb" : "unidad(es)"}
                    {typeof it?.unitPrice === "number" && (
                      <> · $ {fmtMoney(it.unitPrice)} c/u</>
                    )}
                    {" · Total: $ "}{fmtMoney(Number(it?.lineTotal)||0)}
                    {typeof it?.lineSubtotal === "number" && (Number(it?.lineSubtotal) !== Number(it?.lineTotal)) && (
                      <> <span className="text-xs text-gray-500">(Antes: $ {fmtMoney(it.lineSubtotal)})</span></>
                    )}
                  </div>
                </li>
              );
            }

            const bowl = it?.bowlName || it?.bowlId || "Bowl";
            const prot = formatQtyMapAsNames(it?.proteinas, proteCat);
            const tops = formatQtyMapAsNames(it?.toppings,  toppCat);
            const sals = formatKeysAsNames(it?.salsas,      salsaCat);

            const bebd = it?.bebidaId
              ? (bebidasCat.find((b) => b.id === it.bebidaId)?.name || it.bebidaId)
              : "";

            const comboBebidaName = nameById(comboBebidas, it?.comboBebidaId || "");
            const comboSnackName  = nameById(comboSnacks,  it?.comboSnackId  || "");
            const combo = it?.combo
              ? `+ Combo (${comboBebidaName || "250ml"}${comboSnackName ? ` · Snack: ${comboSnackName}` : ""})`
              : bebd || "";

            return (
              <li key={i} className="text-sm leading-5">
                <div className="font-medium">#{i + 1} {bowl}</div>
                <div>🍗 {prot}</div>
                <div>🥗 {tops}</div>
                <div>🧂 {sals}</div>
                {combo ? <div>🥤 {combo}</div> : null}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Totales */}
      <div className="pt-3 text-right space-y-0.5">
        {(promoDisc > 0 || mayDisc > 0) && (
          <div className="text-sm text-gray-600">
            Subtotal: $ {fmtMoney(subtotalShow)}
            {promoDisc > 0 && <> · Promo: -$ {fmtMoney(promoDisc)}</>}
            {mayDisc > 0 && <> · Mayorista: -$ {fmtMoney(mayDisc)}</>}
          </div>
        )}
        <div>
          <span className="text-sm text-gray-500 mr-2">Total:</span>
          <span className="text-xl font-bold">$ {fmtMoney(totalShow || p?.total || 0)}</span>
        </div>
      </div>

      {/* Acciones: barra sticky abajo para que siempre estén visibles */}
      <div className="sticky bottom-0 left-0 right-0 -mb-3 pt-2 bg-white/95 backdrop-blur-sm">
        <div className="flex flex-wrap gap-2 pt-2">
          <a href={waConfirmURL} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
            WhatsApp confirmar
          </a>
          <a href={waOnWayURL} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700">
            WhatsApp en camino
          </a>
          <a href={waReadyURL} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700">
            WhatsApp listo para recoger
          </a>
        </div>
      </div>
    </div>
  );
};


  return (
    <>
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

              <a href="#pedidos">Pedidos (pendientes / histórico)</a>
              <a href="#horarios">Horario y estado de tienda</a>
              <a href="#editor-menu">Editor de menú</a>
              {role === "admin" && (
                <>
                  <a href="#home">Inicio (HomeSplit)</a>
                  <a href="#bebidas-categorias">Bebidas · Categorías</a>
                  <a href="#promos">Promociones</a>
                  <a href="#promo-codes">Códigos promocionales</a>
                  <a href="#temporada">Fruver · Temporada</a>
                  <a href="#combo">Combo</a>
                  <a href="#fruver-admin">Fruver </a>
                  <a href="#fruver-precios">Fruver · Carga masiva</a>
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

            
            <AccordionCard id="horarios" title="Horario de la tienda (Bogotá)">
              {role === "admin" ? (
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
              ) : (
                <div className="text-sm text-gray-500">Solo los administradores pueden editar el horario.</div>
              )}
            </AccordionCard>

       

            {/* ======= Pedidos ======= */}
<AccordionCard
  id="pedidos"
  title="Pedidos (pendientes / histórico)"
  aside={
    <span className="text-sm text-gray-500">
      {pedidosPendientes.length} pend. · {pedidosHistorico.length} hist.
    </span>
  }
>
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
            </AccordionCard>
            {/* ======= Editor de menú (ancla general) ======= */}
            <div id="editor-menu" />

<AccordionCard id="identidad" title="Identidad y Portada">
  <div className="space-y-5">
    <p className="text-sm text-gray-600">
      Configura los elementos visuales principales del sitio: logotipos, imagen de portada, lema y colores.
    </p>

    {/* Logos */}
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-gray-600 mb-1">Logo principal (header)</label>
        {/* Bloque del Logo Principal con Control de Tamaño */}
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
        <input
          className="w-full border p-2 rounded-lg"
          value={identityCfg.logoUrl}
          onChange={(e) => setIdentityCfg(prev => ({ ...prev, logoUrl: e.target.value }))}
          placeholder="https://..."
        />
        {identityCfg.logoUrl && (
          <div className="mt-2">
            <img src={identityCfg.logoUrl} alt="logo" className="h-16 object-contain" />
          </div>
        )}
      </div>

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
          className="w-full border rounded-lg h-10 cursor-pointer"
          value={identityCfg.bgColor}
          onChange={(e) => setIdentityCfg(prev => ({ ...prev, bgColor: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">Color primario</label>
        <input
          type="color"
          className="w-full border rounded-lg h-10 cursor-pointer"
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
</AccordionCard>

            <AccordionCard id="barrios" title="Zonas / Barrios (domicilios)">
  {(() => {
    const initial = Array.isArray(menu?.barrios) ? menu.barrios : [];
    const [barrios, setBarrios] = React.useState(initial);

    React.useEffect(() => setBarrios(Array.isArray(menu?.barrios) ? menu.barrios : []), [menu?.barrios]);

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
  })()}
</AccordionCard>
<AccordionCard id="bowls-editor" title="Bowls">
  {(() => {
    const initial = Array.isArray(menu?.bowls) ? menu.bowls : [];
    const [bowls, setBowls] = React.useState(initial);

    React.useEffect(() => setBowls(Array.isArray(menu?.bowls) ? menu.bowls : []), [menu?.bowls]);

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
  })()}
</AccordionCard>
<AccordionCard id="proteinas-editor" title="Proteínas">
  {(() => {
    const initial = Array.isArray(menu?.proteinas) ? menu.proteinas : [];
    const [prote, setProte] = React.useState(initial);

    React.useEffect(() => setProte(Array.isArray(menu?.proteinas) ? menu.proteinas : []), [menu?.proteinas]);

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
          El <b>extraPrice</b> es el valor que se cobrará por proteína extra (el cliente puede pasar del límite del bowl).
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
        )}

        <div className="text-right">
          <button onClick={save} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
            Guardar proteínas
          </button>
        </div>
      </div>
    );
  })()}
</AccordionCard>
<AccordionCard id="toppings-editor" title="Toppings">
  {(() => {
    const initial = Array.isArray(menu?.toppings) ? menu.toppings : [];
    const [tops, setTops] = React.useState(initial);

    React.useEffect(() => setTops(Array.isArray(menu?.toppings) ? menu.toppings : []), [menu?.toppings]);

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
        )}

        <div className="text-right">
          <button onClick={save} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
            Guardar toppings
          </button>
        </div>
      </div>
    );
  })()}
</AccordionCard>
<AccordionCard id="bebidas-editor" title="Bebidas">
  {(() => {
    const initial = Array.isArray(menu?.bebidas) ? menu.bebidas : [];
    const [bebidas, setBebidas] = React.useState(initial);

    React.useEffect(() => setBebidas(Array.isArray(menu?.bebidas) ? menu.bebidas : []), [menu?.bebidas]);

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
          <div className="grid md:grid-cols-2 gap-4">
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
        )}

        <div className="text-right">
          <button onClick={save} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
            Guardar bebidas
          </button>
        </div>
      </div>
    );
  })()}
</AccordionCard>


            {/* ======= HomeSplit ======= */}
{role === "admin" && (
  <AccordionCard id="home" title="Inicio (HomeSplit): imágenes y opacidad">
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Imagen — Propuesta gastronómica (URL)</label>
                      <input
                        className="w-full border p-2 rounded-lg"
                        value={home.heroUrl}
                        onChange={(e) => setHome((h) => ({ ...h, heroUrl: e.target.value }))}
                        placeholder="https://.../gastro.jpg"
                      />
                      {home.heroUrl ? (
                        <div className="mt-2 admin-img-frame">
                          <img src={home.heroUrl} alt="Propuesta gastronómica" />
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Imagen — Fruver (URL)</label>
                      <input
                        className="w-full border p-2 rounded-lg"
                        value={home.heroFruverUrl}
                        onChange={(e) => setHome((h) => ({ ...h, heroFruverUrl: e.target.value }))}
                        placeholder="https://.../fruver.jpg"
                      />
                      {home.heroFruverUrl ? (
                        <div className="mt-2 admin-img-frame">
                          <img src={home.heroFruverUrl} alt="Fruver" />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4 items-end">
                    <div className="md:col-span-2">
                      <label className="block text-sm text-gray-700 mb-1">
                        Opacidad del overlay (0 a 1)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={Math.max(0, Math.min(1, Number(home.overlay) || 0))}
                          onChange={(e) => setHome((h) => ({ ...h, overlay: Number(e.target.value) }))}
                          className="w-full"
                        />
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          className="w-24 border p-2 rounded-lg"
                          value={String(home.overlay)}
                          onChange={(e) => setHome((h) => ({ ...h, overlay: e.target.value }))}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Tip: 0.6 es un buen punto de partida. (Se reduce 0.2 en hover).
                      </p>
                    </div>

                    <div className="text-right">
                      <button
                        onClick={saveHome}
                        className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                      >
                        Guardar portada
                      </button>
                    </div>
                  </div>
                </div>
              </AccordionCard>
            )}

            {/* ======= Promociones ======= */}
{role === "admin" && (
  <AccordionCard id="promos" title="Promociones (Bowls y Fruver)">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Marca productos con un porcentaje de descuento. Se aplica automáticamente al total y se mostrará un badge rojo en la tienda.
                  </p>

                  <div className="grid md:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Tipo</label>
                      <select
                        className="w-full border p-2 rounded-lg"
                        value={promoType}
                        onChange={(e) => { setPromoType(e.target.value); setPromoProductId(""); }}
                      >
                        <option value="bowls">Bowls</option>
                        <option value="fruver">Fruver</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm text-gray-700 mb-1">Producto</label>
                      <select
                        className="w-full border p-2 rounded-lg"
                        value={promoProductId}
                        onChange={(e) => setPromoProductId(e.target.value)}
                      >
                        <option value="">— Elige —</option>
                        {(promoType === "bowls" ? bowlsList : fruverList)
                          .slice()
                          .sort((a,b) => String(a?.name||"").localeCompare(String(b?.name||"")))
                          .map((it) => (
                            <option key={it.id} value={it.id}>{it.name}</option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1">% Descuento</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-full border p-2 rounded-lg"
                        value={promoPercent}
                        onChange={(e) => setPromoPercent(e.target.value)}
                      />
                    </div>

                    <div className="md:col-span-4 text-right">
                      <button
                        onClick={upsertPromo}
                        className="px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 mr-2"
                      >
                        Agregar / Actualizar
                      </button>
                      <button
                        onClick={saveDiscounts}
                        className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                      >
                        Guardar promociones
                      </button>
                    </div>
                  </div>

                  {/* Listado actual de promos */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Bowls */}
                    <div className="border rounded-lg p-3">
                      <h3 className="font-medium mb-2">Bowls con promoción</h3>
                      {Object.keys(discounts?.bowls || {}).length === 0 ? (
                        <div className="text-sm text-gray-500">No hay promociones activas para bowls.</div>
                      ) : (
                        <ul className="space-y-2">
                          {Object.entries(discounts.bowls).map(([id, pct]) => (
                            <li key={id} className="flex items-center justify-between border rounded-lg p-2">
                              <div>
                                <div className="font-medium">{nameById(bowlsList, id)}</div>
                                <div className="text-xs text-gray-600">ID: {id}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-red-600">{pct}%</span>
                                <button
                                  onClick={() => removePromo("bowls", id)}
                                  className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                                >
                                  Quitar
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Fruver */}
                    <div className="border rounded-lg p-3">
                      <h3 className="font-medium mb-2">Fruver con promoción</h3>
                      {Object.keys(discounts?.fruver || {}).length === 0 ? (
                        <div className="text-sm text-gray-500">No hay promociones activas para fruver.</div>
                      ) : (
                        <ul className="space-y-2">
                          {Object.entries(discounts.fruver).map(([id, pct]) => (
                            <li key={id} className="flex items-center justify-between border rounded-lg p-2">
                              <div>
                                <div className="font-medium">{nameById(fruverList, id)}</div>
                                <div className="text-xs text-gray-600">ID: {id}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-red-600">{pct}%</span>
                                <button
                                  onClick={() => removePromo("fruver", id)}
                                  className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
                                >
                                  Quitar
                                </button>

                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </AccordionCard>
            )}
{role === "admin" && (
  <AccordionCard
    id="promo-codes"
    title="Códigos promocionales"
    aside={
      <button
        onClick={addPromoCode}
        className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
      >
        + Agregar código
      </button>
    }
  >
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Define códigos (p. ej. <b>NUEVO10</b>) con <b>%</b> y <b>vigencia</b>. Los vencidos se eliminan al guardar.
      </p>

      {Object.keys(promoCodes).length === 0 ? (
        <div className="text-sm text-gray-500">Aún no hay códigos. Agrega uno para comenzar.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {Object.entries(promoCodes).map(([code, val]) => {
            const pct = readPercent(val);
            const startStr = readStartStr(val);
            const endStr   = readEndStr(val);

            const now = Date.now();
            const startAt = startStr ? toMs(startStr) : undefined;
            const endAt   = endStr   ? toMs(endStr)   : undefined;
            const isSoon = startAt && startAt > now;
            const isExpired = endAt && endAt < now;

            return (
              <div key={code} className="border rounded-lg p-3 space-y-3 bg-white">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Código</label>
                    <input
                      className="w-full border p-2 rounded-lg uppercase"
                      defaultValue={code}
                      onBlur={(e) => renamePromoCode(code, e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">% Descuento</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-full border p-2 rounded-lg"
                      value={pct}
                      onChange={(e) => setPromoValue(code, e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Válido desde</label>
                    <input
                      type="date"
                      className="w-full border p-2 rounded-lg"
                      value={startStr}
                      onChange={(e) => setPromoDate(code, "startAt", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Válido hasta</label>
                    <input
                      type="date"
                      className="w-full border p-2 rounded-lg"
                      value={endStr}
                      onChange={(e) => setPromoDate(code, "endAt", e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs">
                    {isExpired ? (
                      <span className="px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                        Vencido
                      </span>
                    ) : isSoon ? (
                      <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        Próximo (aún no inicia)
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Activo por vigencia
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => removePromoCode(code)}
                    className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-right">
        <button
          onClick={savePromoCodes}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
        >
          Guardar códigos
        </button>
      </div>
    </div>
  </AccordionCard>
)}

            {/* ======= Temporada Fruver ======= */}
                {role === "admin" && (
                  <AccordionCard
                    id="temporada"
                    title="Fruver · Productos de temporada"
                    aside={
                      <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Aparecen en el carrusel de la tienda
                      </span>
                    }
                  >

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
                          return (
                            <label
                              key={it.id}
                              className={`relative flex items-center gap-3 border rounded-lg p-3 bg-white hover:shadow-sm transition ${
                                seasonalIDs.includes(it.id) ? "ring-2 ring-emerald-300" : ""
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
                                  <div className="font-medium truncate">{it.name}</div>
                                  {pct > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                                      OFERTA {pct}%
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 truncate">{it.id}</div>
                              </div>

                              <input
                                type="checkbox"
                                className="w-5 h-5 accent-emerald-600"
                                checked={seasonalIDs.includes(it.id)}
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
                      className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm"
                    >
                      Guardar temporada
                    </button>
                  </div>
                </div>
              </AccordionCard>
            )}

           

            {/* ======= Combo ======= */}
            {role === "admin" && (
              <AccordionCard id="combo" title="Combo: precio, bebidas 250 ml y snacks">

                <div className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1">Precio del combo</label>
                      <input
                        type="number"
                        className="w-full border p-2 rounded-lg"
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
                          className="w-full border p-2 rounded-lg"
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
                          className="w-full border p-2 rounded-lg"
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
                      className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      Guardar combo
                    </button>
                  </div>
                </div>
              </AccordionCard>
            )}

            {/* ======= Bebidas · Categorías ======= */}
            {role === "admin" && (
              <AccordionCard
                id="bebidas-categorias"
                title="Bebidas · Categorías"
                aside={
                  <button
                    onClick={addBebCat}
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    + Agregar categoría
                  </button>
                }
              >

                <div className="space-y-4">
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
                                className="w-full border p-2 rounded-lg font-medium"
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
                            <div className="text-sm text-gray-700 mb-2">Asignar bebidas</div>
                            {bebidasCatalog.length === 0 ? (
                              <div className="text-xs text-gray-500">Aún no tienes bebidas creadas.</div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {bebidasCatalog
                                  .slice()
                                  .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")))
                                  .map((b) => {
                                    const checked = (cat.beverageIds || []).includes(b.id);
                                    return (
                                      <label key={b.id} className="flex items-center gap-2 border rounded-md p-2">
                                        <input
                                          type="checkbox"
                                          className="accent-emerald-600"
                                          checked={checked}
                                          onChange={() => toggleBeverageInCat(idx, b.id)}
                                        />
                                        <span className="text-sm">{b.name}</span>
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

                  <div className="text-right">
                    <button
                      onClick={saveBeverageCategories}
                      className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      Guardar categorías
                    </button>
                  </div>
                </div>
              </AccordionCard>
            )}

            {/* ======= Fruver Admin ======= */}
            {role === "admin" && (
              <AccordionCard
                id="fruver-admin"
                title="Fruver"
                aside={
                  <button
                    onClick={addFruver}
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    + Agregar producto
                  </button>
                }
              >
                 {/* Controles de filtro */}
<div className="flex items-center justify-between gap-3">
  <div className="inline-flex rounded-lg border overflow-hidden">
    <button
      type="button"
      onClick={() => setFruverFilter("all")}
      className={`px-3 py-1.5 text-sm ${fruverFilter === "all" ? "bg-emerald-600 text-white" : "bg-white text-gray-700"}`}
    >
      Todos
    </button>
    <button
      type="button"
      onClick={() => setFruverFilter("active")}
      className={`px-3 py-1.5 text-sm border-l ${fruverFilter === "active" ? "bg-emerald-600 text-white" : "bg-white text-gray-700"}`}
    >
      Activos
    </button>
    <button
      type="button"
      onClick={() => setFruverFilter("inactive")}
      className={`px-3 py-1.5 text-sm border-l ${fruverFilter === "inactive" ? "bg-emerald-600 text-white" : "bg-white text-gray-700"}`}
    >
      Inactivos
    </button>
  </div>

  <div className="text-xs text-gray-500">
    Total: {fruver?.length || 0} · Activos: {fruver?.filter(x => x?.active !== false).length || 0} · Inactivos: {fruver?.filter(x => x?.active === false).length || 0}
  </div>
</div>


                <div className="space-y-4">
                  {(!fruver || fruver.length === 0) ? (
                    <div className="text-sm text-gray-500">
                      No hay productos fruver. Agrega uno para comenzar.
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {fruverVisible.map((it) => (
                        <div key={it.id} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                          <div className="w-full aspect-square bg-gray-100 overflow-hidden">
                            {it.img ? <img src={it.img} alt={it.name} className="w-full h-full object-cover" /> : null}
                          </div>
                          <div className="p-3 space-y-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                              <input
                                className="w-full border p-2 rounded-lg"
                                value={it.name ?? ""}
                                onChange={(e) => updFruverById(it.id, { name: e.target.value })}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Precio</label>
                                <input
                                  type="number"
                                  className="w-full border p-2 rounded-lg"
                                  value={Number(it.price || 0)}
                                  onChange={(e) => updFruverById(it.id, { price: Number(e.target.value || 0) })}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Unidad</label>
                                <select
                                  className="w-full border p-2 rounded-lg"
                                  value={it.unit || "lb"}
                                  onChange={(e) => updFruverById(it.id, { unit: e.target.value })}
                                >
                                  <option value="lb">Libra (lb)</option>
                                  <option value="unidad">Unidad</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                              <input
                                className="w-full border p-2 rounded-lg"
                                value={it.img ?? ""}
                                onChange={(e) => updFruverById(it.id, { img: e.target.value })}
                                placeholder="https://..."
                              />
                            </div>
                            {/* Toggle Activo/Inactivo */}
                            <div className="flex items-center gap-3 mt-2">
                              <label className="flex items-center gap-2 text-sm select-none">
                                <input
                                  type="checkbox"
                                  checked={it.active !== false}
                                  onChange={(e) => updFruverById(it.id, { active: e.target.checked })}
                                />
                                <span className={it.active === false ? "text-red-600" : "text-emerald-700"}>
                                  {it.active === false ? "Inactivo" : "Activo"}
                                </span>
                              </label>
                              {it.active === false && (
                                <span className="text-xs text-gray-500">
                                  (No se mostrará en la tienda)
                                </span>
                              )}
                            </div>


                            <div className="flex items-center justify-between pt-1">
                              <small className="text-gray-500 break-all">{it.id}</small>
                              <button
                                type="button"
                                className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700"
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

                  <div className="text-right">
                    <button
                      onClick={saveFruver}
                      className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      Guardar fruver
                    </button>
                  </div>
                </div>
              </AccordionCard>
            )}

            {role === "admin" && (
  <AccordionCard
    id="fruver-precios"
    title="Fruver · Precios (CSV mínimo)"
    aside={<span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Rápido y simple</span>}
  >
    <FruverBulkPricesLite
  items={Array.isArray(menu?.fruver) ? menu.fruver : []}
  onApply={(nextArray) => {
    // MERGE directo en tu objeto menu y guardas con tu helper
    const next = { ...(menu || {}), fruver: nextArray };
    setMenu(next); // ← usa tu función existente
    alert("Precios de fruver actualizados ✅");
  }}
/>

  </AccordionCard>
)}


            {/* ======= Mensajes WhatsApp ======= */}
                {role === "admin" && (
                  <AccordionCard id="wa" title="Mensajes de WhatsApp">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Placeholders:{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">{`{{orderId}}`}</code>,{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">{`{{nombre}}`}</code>,{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">{`{{telefono}}`}</code>,{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">{`{{direccion}}`}</code>,{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">{`{{metodoPago}}`}</code>,{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">{`{{modo}}`}</code>,{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">{`{{enMinutos}}`}</code>,{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">{`{{total}}`}</code>,{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">{`{{items}}`}</code>.
                  </p>

                  <div className="grid gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Mensaje de <b>Confirmación</b> (al crear)</label>
                      <textarea
                        rows={6}
                        className="w-full border p-2 rounded-lg font-mono text-sm"
                        value={templates.newOrder}
                        onChange={(e) => setTemplates((t) => ({ ...t, newOrder: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Mensaje <b>En camino</b></label>
                      <textarea
                        rows={5}
                        className="w-full border p-2 rounded-lg font-mono text-sm"
                        value={templates.outForDelivery}
                        onChange={(e) => setTemplates((t) => ({ ...t, outForDelivery: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Mensaje <b>Listo para recoger</b></label>
                      <textarea
                        rows={5}
                        className="w-full border p-2 rounded-lg font-mono text-sm"
                        value={templates.readyForPickup}
                        onChange={(e) => setTemplates((t) => ({ ...t, readyForPickup: e.target.value }))}
                      />
                    </div>

                    <div className="flex justify-end">
                      <button onClick={saveTemplates} className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
                        Guardar plantillas
                      </button>
                    </div>
                  </div>
                </div>
              </AccordionCard>
            )}

            {/* ======= Usuarios y permisos ======= */}
                {role === "admin" && (
                <AccordionCard id="usuarios" title="Usuarios y permisos">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Correos con rol <b>admin</b>. Un correo por línea o separados por comas.
                  </p>
                  <textarea
                    rows={5}
                    className="w-full border p-2 rounded-lg"
                    value={adminsText}
                    onChange={(e) => setAdminsText(e.target.value)}
                    placeholder={"admin@ejemplo.com\nsocio@ejemplo.com"}
                  />
                  <div className="text-right">
                    <button
                      onClick={saveAdmins}
                      className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      Guardar administradores
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Crea el usuario en tu proveedor de autenticación (p. ej. Firebase Auth) con ese correo
                    y pídeles iniciar sesión. Si el correo está listado arriba, verá la intranet como <b>admin</b>.
                  </p>
                </div>
              </AccordionCard>
            )}
          </main>
        </div>
      </div>

      {/* Modal de detalle */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailOrder ? `Pedido #${detailOrder.id}` : "Detalle de pedido"}
      >
        <DetailBody p={detailOrder} />
      </Modal>
    </>
  );
}
