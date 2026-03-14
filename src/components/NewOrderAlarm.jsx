// src/components/NewOrderAlarm.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePedido } from "../context/PedidoContext";
import { useNavigate } from "react-router-dom";

/**
 * - Sonido remoto suave cada 4s (vol 0.7) mientras existan pedidos "no atendidos".
 * - Overlay grande tipo alerta. Botón "Ir a Intranet" cierra overlay, apaga audio y navega a /intranet.
 * - Si autoplay está bloqueado, muestra botón "Activar sonido".
 * - Se rearma automáticamente cuando ya no haya pendientes (para futuras órdenes).
 */
export default function NewOrderAlarm() {
  const { pedidosPendientes = [] } = usePedido();
  const navigate = useNavigate();

  const audioRef = useRef(null);
  const loopRef = useRef(null);

  const [needUnlock, setNeedUnlock] = useState(false);
  const [hideOverlay, setHideOverlay] = useState(false);
  const [manualSilenced, setManualSilenced] = useState(false); // evita reactivar el loop hasta que se vacíen pendientes

  // IDs actuales
  const currentIds = useMemo(
    () => new Set(pedidosPendientes.map((p) => String(p.id))),
    [pedidosPendientes]
  );

  // IDs aún no atendidos (para disparar alarma)
  const [unseenIds, setUnseenIds] = useState(new Set());
  useEffect(() => {
    setUnseenIds((prev) => {
      const next = new Set(prev);
      // agrega nuevos
      for (const id of currentIds) if (!next.has(id)) next.add(id);
      // quita atendidos
      for (const id of Array.from(next)) if (!currentIds.has(id)) next.delete(id);
      return next;
    });
  }, [currentIds]);

  const alarmActive = unseenIds.size > 0;

  // Volumen inicial del audio
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = 1.0;
  }, []);

  // Funciones de control de audio
  const playOnce = async () => {
    try {
      if (!audioRef.current) return;
      audioRef.current.currentTime = 0;
      audioRef.current.volume = 1.0;
      await audioRef.current.play();
      setNeedUnlock(false);
    } catch {
      setNeedUnlock(true);
    }
  };

  const stopAll = () => {
    // Detener bucle
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    // Pausar audio y resetear
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
    }
  };

  // Bucle de sonido cada 4s mientras haya no atendidos y no se haya silenciado manualmente
  useEffect(() => {
    // Limpiar previo
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }

    if (alarmActive && !manualSilenced) {
      // reproducir inmediato y luego cada 4s
      playOnce();
      loopRef.current = setInterval(() => playOnce(), 4000);
    }

    return () => {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
    };
  }, [alarmActive, manualSilenced]);

  // Rearme automático cuando ya no hay pendientes
  useEffect(() => {
    if (!alarmActive) {
      // rearmar para la próxima vez
      setHideOverlay(false);
      setManualSilenced(false);
      // asegurar que no queda sonando
      stopAll();
    }
  }, [alarmActive]);

  // Click principal: cerrar overlay, apagar audio y navegar a /intranet
  const goToIntranet = () => {
    setHideOverlay(true);
    setManualSilenced(true); // evita que el loop se reactive mientras sigan pendientes
    stopAll();
    navigate("/intranet");
  };

  // Sonido remoto
  const SOUND_URLS = [
    "https://actions.google.com/sounds/v1/alarms/beep_short.ogg",
    "https://actions.google.com/sounds/v1/alarms/beep_short.ogg",
  ];

  return (
    <>
      <audio ref={audioRef} preload="auto" crossOrigin="anonymous">
        {SOUND_URLS.map((src, i) => (
          <source key={i} src={src} />
        ))}
      </audio>

      <style>{`
        @keyframes softPulse {
          0%   { transform: scale(1); box-shadow: 0 10px 30px rgba(16,185,129,.20); }
          50%  { transform: scale(1.02); box-shadow: 0 18px 40px rgba(16,185,129,.30); }
          100% { transform: scale(1); box-shadow: 0 10px 30px rgba(16,185,129,.20); }
        }
        .alarm-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,.5);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
        }
        .alarm-card {
          width: 100%; max-width: 560px; background: white;
          border-radius: 16px; overflow: hidden;
          animation: softPulse 1.8s ease-in-out infinite;
          border: 3px solid rgba(16,185,129,.5);
        }
        .alarm-header {
          background: #10b981; color: #fff; padding: 16px;
          font-weight: 700; font-size: 20px; text-align: center;
        }
        .alarm-body { padding: 18px; color: #111827; }
        .alarm-actions {
          display: flex; gap: 10px; flex-wrap: wrap;
          justify-content: center; padding: 0 18px 18px;
        }
        .btn-primary {
          background: #111827; color: #fff; border-radius: 9999px;
          padding: 10px 16px; font-weight: 600;
        }
        .btn-primary:hover { filter: brightness(1.05); }
        .unlock {
          position: fixed; right: 16px; bottom: 16px; z-index: 10000;
          background: #111827; color: #fff; border-radius: 9999px;
          padding: 10px 14px; font-size: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,.18);
        }
        .unlock:hover { filter: brightness(1.05); }
      `}</style>

      {/* Overlay visible sólo si hay alarma y no está oculto manualmente */}
      {alarmActive && !hideOverlay && (
        <div className="alarm-overlay" role="alert" aria-live="assertive">
          <div className="alarm-card">
            <div className="alarm-header">¡Nuevo pedido!</div>
            <div className="alarm-body">
              <p className="text-center text-base">
                Tienes {unseenIds.size} pedido(s) nuevo(s) sin atender.
              </p>
              <p className="mt-2 text-center text-sm text-gray-600">
                El sonido se repetirá hasta que ingreses a <b>Intranet</b> y atiendas los pedidos.
              </p>
            </div>
            <div className="alarm-actions">
              <button type="button" className="btn-primary" onClick={goToIntranet}>
                Ir a Intranet
              </button>
            </div>
          </div>
        </div>
      )}

      {needUnlock && (
        <button className="unlock" onClick={playOnce} title="Activar sonido de notificaciones">
          🔊 Activar sonido
        </button>
      )}
    </>
  );
}
