// App.jsx
import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import LoaderOverlay from './components/LoaderOverlay';


import HomeSplit from "./pages/HomeSplit";
import Fruver from "./pages/Fruver";

import Cliente from './pages/Cliente.jsx';
import Login from './pages/Login.jsx';

import Intranet from '../src/pages/intranet.jsx';
import MenuEditor from './components/MenuEditor.jsx';
import Pedidos from './components/Pedidos.jsx';

import Footer from './components/Footer.jsx';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute.jsx';
import { usePedido } from './context/PedidoContext.jsx';

import NewOrderAlarm from "./components/NewOrderAlarm";
import Clientes from "./pages/Clientes.jsx";



function Shell({ children }) {
  // ASEGÚRATE DE INCLUIR 'role'
  const { user, role, /* logout, */ menu } = usePedido();

  const [showLoader, setShowLoader] = React.useState(true);
  const [showChat, setShowChat] = React.useState(false);

  // LÓGICA DE VISIBILIDAD DE ENLACES
  const showIntranetLink = user && (role === 'admin' || role === 'operator');

  const [chatInput, setChatInput] = React.useState("");
  const [chatMessages, setChatMessages] = React.useState([
    { role: "bot", text: "¡Hola! Soy el asistente de Más Campo 🌿 ¿En qué te ayudo?" },
  ]);

  const chatEndRef = React.useRef(null);
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, showChat]);

  // Enviar mensaje (llama a /api/chat)
  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg) return;

    // Agrega el mensaje del usuario
    setChatMessages((m) => [...m, { role: "user", text: msg }]);
    setChatInput("");

    // Mensaje temporal "escribiendo…"
    const pendingId = Math.random().toString(36).slice(2);
    setChatMessages((m) => [...m, { role: "bot", text: "Escribiendo…", _pending: pendingId }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: chatMessages.map(({ role, text }) => ({
            role: role === "user" ? "user" : "assistant",
            content: text,
          })),
        }),
      });

      // Si el endpoint aún no existe o falla
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply = (data && data.reply) ? String(data.reply).trim() : "";

      setChatMessages((m) =>
        m.map((it) =>
          it._pending === pendingId
            ? { role: "bot", text: reply || "No pude generar respuesta. Intenta otra vez." }
            : it
        )
      );
    } catch (e) {
      setChatMessages((m) =>
        m.map((it) =>
          it._pending === pendingId
            ? { role: "bot", text: "No pude conectar con el asistente en este momento. Intenta de nuevo más tarde." }
            : it
        )
      );
    }
  };

  // Permitir enviar con Enter
  const onInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  React.useEffect(() => {
    const onLoad = () => setShowLoader(false);

    if (document.readyState === 'complete') {
      const t = setTimeout(() => setShowLoader(false), 900);
      return () => clearTimeout(t);
    }

    window.addEventListener('load', onLoad);
    const t = setTimeout(() => setShowLoader(false), 1200);
    return () => {
      window.removeEventListener('load', onLoad);
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Loader overlay */}
      <LoaderOverlay show={showLoader || !menu} logoUrl={menu?.logoUrl || ''} />

      {/* Header (logo centrado, botones condicionales a la derecha) */}
      <header className="border-b bg-white">
        {/* Contenedor RELATIVE para centrar el logo sin nada a los lados */}
        <div className="max-w-7xl mx-auto px-6 py-3 relative">
          {/* CENTRO: LOGO perfectamente centrado */}
          <NavLink to="/" className="block mx-auto w-fit">
            {menu?.logoUrl ? (
              <img src={menu.logoUrl} alt="Logo" className="h-10 sm:h-12 w-auto" />
            ) : (
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded bg-brand-600" />
            )}
          </NavLink>
          
          {/* IZQUIERDA intencionalmente vacía */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2" />
          
          {/* DERECHA: Botones condicionales */}
          
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* PASAMOS LA BANDERA AL FOOTER PARA OCULTAR EL ENLACE A INTRANET SI NO ES STAFF */}
      <Footer logoUrl={menu?.logoUrl} showIntranetLink={showIntranetLink} />

      {/* Alarma solo para usuarios logueados */}
      {user && <NewOrderAlarm />}

      </div>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <Shell>
        <Routes>
          {/* Pública */}
          <Route path='/' element={<HomeSplit />} />
          <Route path='/cliente' element={<Cliente />} />
          <Route path='/fruver' element={<Fruver />} />
          <Route path="/login" element={<Login />} />

          {/* Protegidas */}
          <Route
            path="/intranet"
            element={
              <ProtectedRoute>
                <Intranet />
              </ProtectedRoute>
            }
          />

          <Route
            path="/intranet/pedidos"
            element={
              <ProtectedRoute>
                <Pedidos />
              </ProtectedRoute>
            }
          />

          <Route
            path="/intranet/menu"
            element={
              <AdminRoute>
                <MenuEditor />
              </AdminRoute>
            }
          />



            <Route
    path="/src/pages/Clientes.jsx"
    element={
      <AdminRoute>
        <Clientes />
      </AdminRoute>
    }
  />



          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </HelmetProvider>
  );
}