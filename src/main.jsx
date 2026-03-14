// src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { PedidoProvider } from './context/PedidoContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PedidoProvider>
        <App />
      </PedidoProvider>
    </BrowserRouter>
  </React.StrictMode>
);
