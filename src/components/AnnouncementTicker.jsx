// src/components/AnnouncementTicker.jsx
import React from "react";

export default function AnnouncementTicker({
  text = "⏰ Horario de atención: 8:00 a.m. a 8:00 p.m. | 📍 Carrera 24 a Nro. 60-33, local 1 - Barrio la estrella  | 📱 3043510814   | ¡Gracias por preferir Mas Campo! 🌿  ",
}) {
  return (
    <div className="w-full border border-emerald-200 bg-emerald-50 rounded-lg overflow-hidden">
      <div className="relative h-10">
        <div className="absolute inset-0 overflow-hidden">
          {/* Cinta que se desplaza */}
          <div
            className="whitespace-nowrap h-10 leading-10 px-4 text-emerald-900 font-medium"
            style={{ animation: "mc-marquee-left 18s linear infinite" }}
          >
            <span className="mx-6">{text}</span>
            <span className="mx-6">{text}</span>
            <span className="mx-6">{text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
