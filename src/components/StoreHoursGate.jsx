// src/components/StoreHoursGate.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const BOGOTA_TZ = "America/Bogota";

/* ========= Helpers de fecha/hora ========= */
const WEEK_MAP = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };

function weekKey(date = new Date(), tz = BOGOTA_TZ) {
  const wk = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(date);
  return WEEK_MAP[wk] || "mon";
}
function hmMinutes(date = new Date(), tz = BOGOTA_TZ) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const hh = Number(parts.find(p => p.type === "hour")?.value || 0);
  const mm = Number(parts.find(p => p.type === "minute")?.value || 0);
  return hh * 60 + mm;
}
function parseHM(s) {
  const [h, m] = String(s || "").split(":");
  const hh = Number(h), mm = Number(m);
  return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
}
function isOpenBySchedule(hours = {}, now = new Date(), tz = BOGOTA_TZ) {
  if (!hours || typeof hours !== "object" || Object.keys(hours).length === 0) return true;
  const key = weekKey(now, tz);
  const cfg = hours[key] || {};
  if (cfg.enabled === false) return false;
  const o = parseHM(cfg.open), c = parseHM(cfg.close);
  if (o == null || c == null) return true;
  if (o === c) return true;
  const cur = hmMinutes(now, tz);
  return c > o ? (cur >= o && cur < c) : (cur >= o || cur < c);
}
function addDays(d, n) { const dd = new Date(d); dd.setDate(dd.getDate() + n); return dd; }
function ymdParts(date = new Date(), tz = BOGOTA_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return { y: parts.find(p => p.type === "year")?.value, m: parts.find(p => p.type === "month")?.value, d: parts.find(p => p.type === "day")?.value };
}
function nextOpenDate(hours = {}, now = new Date(), tz = BOGOTA_TZ) {
  if (!hours || typeof hours !== "object") return null;
  for (let i = 0; i < 8; i++) {
    const d = addDays(now, i);
    const key = weekKey(d, tz);
    const cfg = hours[key];
    if (!cfg || cfg.enabled === false) continue;
    const o = parseHM(cfg.open), c = parseHM(cfg.close);
    if (o == null || c == null) continue;
    const { y, m, d: day } = ymdParts(d, tz);
    const candidate = new Date(`${y}-${m}-${day}T${cfg.open}:00-05:00`);
    if (i === 0) {
      const nowM = hmMinutes(now, tz);
      if (nowM < o) return candidate;
      continue;
    }
    return candidate;
  }
  return null;
}
function fmtBogota(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TZ, weekday: "long", hour: "numeric", minute: "2-digit",
  }).format(date);
}
function isClosedFallback(d = new Date()) {
  const parts = new Intl.DateTimeFormat("es-CO", { timeZone: BOGOTA_TZ, hour: "numeric", hour12: false }).formatToParts(d);
  const h = Number(parts.find(p => p.type === "hour")?.value || "0");
  return h >= 21 || h < 10;
}

/* ========= Componente ========= */
export default function StoreHoursGate({
  isClosed, closed, visible, show, isOpen, open,
  hours, tz = BOGOTA_TZ,
  nextOpenAt, nextOpenLabel,
  logoUrl, loginHref = "/login",
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const scheduleOpen = useMemo(() => {
    return hours ? isOpenBySchedule(hours, now, tz) : !isClosedFallback(now);
  }, [hours, now, tz]);

  let manualOpen;
  if (typeof isOpen === "boolean") manualOpen = isOpen;
  if (typeof open === "boolean") manualOpen = open;
  if (typeof isClosed === "boolean") manualOpen = !isClosed;
  if (typeof closed === "boolean") manualOpen = !closed;
  if (typeof visible === "boolean") manualOpen = !visible;
  if (typeof show === "boolean") manualOpen = !show;

  const openState = typeof manualOpen === "boolean" ? manualOpen : scheduleOpen;
  const shouldShow = !openState;

  const computedNext = useMemo(() => {
    if (nextOpenAt) return nextOpenAt;
    if (!hours) return null;
    return nextOpenDate(hours, now, tz);
  }, [hours, nextOpenAt, now, tz]);
  const nextLabel = nextOpenLabel || (computedNext ? fmtBogota(computedNext) : null);

  const todayCfg = useMemo(() => {
    if (!hours) return null;
    const key = weekKey(now, tz);
    return hours[key] || null;
  }, [hours, now, tz]);

  if (!shouldShow) return null;

  const waMsg = encodeURIComponent(
    "Hola Más Campo 👋 Vi el aviso de tienda cerrada. ¿Me ayudas con info/pedido? Gracias."
  );
  const waURL = `https://wa.me/573122209221?text=${waMsg}`;

  return (
    <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
      {/* Botón oculto de acceso admin */}
      <div className="absolute top-2 right-2 z-[2100] opacity-20 hover:opacity-60 transition-opacity">
        <Link
          to={loginHref}
          className="text-[10px] px-2 py-1 rounded-full text-gray-400 hover:text-gray-700 select-none"
          title="Acceso interno"
        >
          ⚙️
        </Link>
      </div>

      {/* Tarjeta principal */}
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-2xl p-7 text-center">
        {logoUrl && (
          <div className="mb-4">
            <img src={logoUrl} alt="Logo" className="h-10 mx-auto object-contain" />
          </div>
        )}

        <div className="text-2xl md:text-3xl font-bold text-emerald-700">
          ¡Estamos cerrados por ahora!
        </div>

        {todayCfg ? (
          <p className="mt-3 text-gray-700 text-sm md:text-base">
            Horario de hoy: <b>{todayCfg.open}</b> a <b>{todayCfg.close}</b> (zona Bogotá).
          </p>
        ) : (
          <p className="mt-3 text-gray-700 text-sm md:text-base">
            Nuestro horario de atención es de <b>10:00 a.m.</b> a <b>9:00 p.m.</b> (zona Bogotá).
          </p>
        )}

        {nextLabel ? (
          <p className="mt-1 text-gray-600 text-xs md:text-sm">
            Abrimos <b>{nextLabel}</b>. ¡Te esperamos!
          </p>
        ) : (
          <p className="mt-1 text-gray-600 text-xs md:text-sm">
            Vuelve a visitarnos más tarde. ¡Gracias por tu preferencia!
          </p>
        )}

        {/* Botón grande de WhatsApp */}
        <a
          href={waURL}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex items-center justify-center w-full px-6 py-4 rounded-xl
                     bg-emerald-600 text-white text-base md:text-lg font-semibold
                     shadow-lg hover:bg-emerald-700 active:scale-[.99] transition"
        >
          Ir a WhatsApp
        </a>

        <p className="mt-2 text-xs text-gray-500">
          Si necesitas algo urgente, escríbenos por WhatsApp y te respondemos apenas abramos.
        </p>
      </div>
    </div>
  );
}
