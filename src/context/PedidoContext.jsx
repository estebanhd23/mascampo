// src/context/PedidoContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  subscribeMenu,
  saveMenu,
  subscribeOrdersPendientes,
  subscribeOrdersHistorico,
  addOrder,
  updateOrderStatus as fbUpdateOrderStatus,
  completeOrder as fbCompleteOrder,
} from '../services/firestore';

import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, collection, addDoc} from 'firebase/firestore';

const PedidoContext = createContext(null);
export function usePedido() { return useContext(PedidoContext); }

export function PedidoProvider({ children }) {
  // Auth & User Info
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('viewer');
  const [userDoc, setUserDocState] = useState(null);
  const [loadingUserDoc, setLoadingUserDoc] = useState(true);

  // Menu
  const [rawMenu, setRawMenu] = useState(null);
  const [loadingMenu, setLoadingMenu] = useState(true);

  // Pedidos
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [pedidosHistorico, setPedidosHistorico] = useState([]);

  // Carritos (Fruver y ahora Parfaits)
  const [cartFruver, setCartFruver] = useState([]);
  const [cartParfaits, setCartParfaits] = useState([]);

  // Preferencias
  const [baseType, setBaseType] = useState('arroz'); 

  // 1. SUBSCRIPCIÓN DE AUTH Y DOCUMENTO DE USUARIO
  useEffect(() => {
    let unsubAuth;
    let unsubUserDoc;

    unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);

      if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = undefined; }
      setUserDocState(null);
      setRole('viewer');
      setLoadingUserDoc(true);

      if (u) {
        const userRef = doc(db, 'users', u.uid);
        unsubUserDoc = onSnapshot(userRef, (snap) => {
             const userData = snap.data() || {};
             setUserDocState({ id: snap.id, ...userData });
             setRole(userData.role || 'viewer');
             setLoadingUserDoc(false);
        }, (err) => {
            console.error('subscribeUserDoc error:', err.code, err.message);
            setRole('viewer');
            setLoadingUserDoc(false);
        });
      } else {
        setLoadingUserDoc(false);
      }
    });

    return () => {
      if (unsubAuth) unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []); 

  // 2. SUBSCRIPCIÓN DEL MENÚ
  useEffect(() => {
    let unsubMenu;
    unsubMenu = subscribeMenu((m) => {
        setRawMenu(m);
        setLoadingMenu(false);
    });
    return () => { if (unsubMenu) unsubMenu(); };
  }, []); 
  
  // 3. SUBSCRIPCIÓN DE PEDIDOS
  useEffect(() => {
    const unsubPendientes = subscribeOrdersPendientes(setPedidosPendientes);
    const unsubHistorico = subscribeOrdersHistorico(setPedidosHistorico);
    return () => {
      unsubPendientes();
      unsubHistorico();
    };
  }, []);

  // 4. PROCESAMIENTO B2B DEL MENÚ (Incluyendo Parfaits)
  const menu = useMemo(() => {
    if (!rawMenu) return null;
    
    const isRestaurant = role === 'restaurant';
    let processedMenu = { ...rawMenu };

    const applyB2B = (items) => {
      if (!Array.isArray(items)) return items;
      return items.map(item => {
        const b2bPrice = Number(item.price_b2b);
        const standardPrice = Number(item.price || 0);
        const finalPrice = (b2bPrice > 0) ? b2bPrice : standardPrice;
        return {
            ...item,
            price: finalPrice, 
            price_b2c: standardPrice
        };
      });
    };

    if (isRestaurant) {
      if (processedMenu.fruver) processedMenu.fruver = applyB2B(processedMenu.fruver);
      if (processedMenu.parfaits) processedMenu.parfaits = applyB2B(processedMenu.parfaits);
    }

    return processedMenu;
  }, [rawMenu, role]);

  // --- Funciones de Carrito ---
  const addFruverItem = (item) => {
    setCartFruver(prev => {
      const existing = prev.find(x => x.id === item.id);
      if (existing) {
        return prev.map(x => x.id === item.id ? { ...x, quantity: x.quantity + item.quantity } : x);
      }
      return [...prev, item];
    });
  };

  const addParfaitItem = (item) => {
    setCartParfaits(prev => {
      const existing = prev.find(x => x.id === item.id);
      if (existing) {
        return prev.map(x => x.id === item.id ? { ...x, quantity: x.quantity + item.quantity } : x);
      }
      return [...prev, item];
    });
  };

  // Métodos Globales
  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);
  const addPedidoPendiente = async (order) => {
  try {
    const orderData = { 
      ...order, 
      userId: user?.uid || "invitado",
      createdAt: new Date().toISOString()
    };

    // 🌟 EL ÚNICO CAMBIO: Cambiamos "pedidos" por "orders"
    const pedidosRef = collection(db, "orders"); 
    await addDoc(pedidosRef, orderData);

  } catch (error) {
    console.error("Error detallado al guardar pedido:", error);
    throw error; 
  }
};
  const updatePedidoStatus = fbUpdateOrderStatus;
  const completePedido = fbCompleteOrder;

  const value = useMemo(() => ({
    user, role, userDoc, loadingUserDoc, 
    login, logout, 
    menu, loadingMenu, 
    setMenu: saveMenu, 
    pedidosPendientes, pedidosHistorico,
    addPedidoPendiente, updatePedidoStatus, completePedido,
    baseType, setBaseType,
    // Carritos y funciones nuevas
    cartFruver, setCartFruver, addFruverItem,
    cartParfaits, setCartParfaits, addParfaitItem,
  }), [
    user, role, userDoc, loadingUserDoc,
    menu, loadingMenu, 
    pedidosPendientes, pedidosHistorico, 
    baseType, cartFruver, cartParfaits
  ]);

  return <PedidoContext.Provider value={value}>{children}</PedidoContext.Provider>;
}