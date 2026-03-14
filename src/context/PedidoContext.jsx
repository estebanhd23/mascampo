// src/context/PedidoContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword, 
} from 'firebase/auth';
import {
  subscribeMenu,
  saveMenu,
  subscribeOrdersPendientes,
  subscribeOrdersHistorico,
  addOrder,
  updateOrderStatus as fbUpdateOrderStatus,
  completeOrder as fbCompleteOrder,
  getMenuOnce,
  setUserDoc,
  // subscribeUserRole, // Ya no usamos esta, usamos onSnapshot directo al userDoc
} from '../services/firestore';

import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore'; // Importamos onSnapshot para el userDoc

const PedidoContext = createContext(null);
export function usePedido() { return useContext(PedidoContext); }

export function PedidoProvider({ children }) {
  // Auth & User Info
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('viewer');
  const [userDoc, setUserDocState] = useState(null); // Documento de Firestore del usuario (para crédito)
  const [loadingUserDoc, setLoadingUserDoc] = useState(true);

  // Menu
  const [rawMenu, setRawMenu] = useState(null); // Menú sin procesar
  const [loadingMenu, setLoadingMenu] = useState(true);

  // Pedidos
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [pedidosHistorico, setPedidosHistorico] = useState([]);

  // Base preference (si aplica)
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
        // Suscribirse al documento de usuario (para rol y crédito B2B)
        const userRef = doc(db, 'users', u.uid);
        
        unsubUserDoc = onSnapshot(userRef, (snap) => {
             const userData = snap.data() || {};
             setUserDocState({ id: snap.id, ...userData }); // Guardar todo el doc
             setRole(userData.role || 'viewer'); // Establecer el rol
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


  // 2. SUBSCRIPCIÓN DEL MENÚ (Carga los datos crudos)
  useEffect(() => {
    let unsubMenu;
    
    unsubMenu = subscribeMenu((m) => {
        setRawMenu(m);
        setLoadingMenu(false);
    });

    return () => {
      if (unsubMenu) unsubMenu();
    };
  }, []); 
  
  // 3. SUBSCRIPCIÓN DE PEDIDOS (Pendientes e Histórico)
  useEffect(() => {
    const unsubPendientes = subscribeOrdersPendientes(setPedidosPendientes);
    const unsubHistorico = subscribeOrdersHistorico(setPedidosHistorico);
    return () => {
      unsubPendientes();
      unsubHistorico();
    };
  }, []);

  // 4. 🛑 PROCESAMIENTO B2B DEL MENÚ (El verdadero "ProMenu")
  const menu = useMemo(() => {
    if (!rawMenu) return null;
    
    const isRestaurant = role === 'restaurant';
    let processedMenu = { ...rawMenu };

    // Si es un restaurante, aplicamos el precio B2B a los productos fruver
    if (isRestaurant && Array.isArray(processedMenu.fruver)) {
        
        // Mapear productos fruver para aplicar precio B2B
        processedMenu.fruver = processedMenu.fruver.map(item => {
            
            const b2bPrice = Number(item.price_b2b);
            const standardPrice = Number(item.price || 0); // Precio original o B2C

            // Si el precio B2B es válido (> 0), úsalo. Si no, usa el precio estándar.
            const finalPrice = (b2bPrice > 0) ? b2bPrice : standardPrice;
            
            // Retorna el ítem con 'price' SOBREESCRITO al precio final (B2B o estándar)
            return {
                ...item,
                price: finalPrice, 
                price_b2c: standardPrice // Guardamos el B2C para referencia
            };
        });
    }

    return processedMenu;
  }, [rawMenu, role]); // Depende del menú crudo y del rol

  // Auth methods
  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);
  const addPedidoPendiente = (order) => addOrder({ ...order, userId: user?.uid });
  const updatePedidoStatus = fbUpdateOrderStatus;
  const completePedido = fbCompleteOrder;
  const saveMenuInFirestore = saveMenu; // Exportamos la función de guardado

  // Funciones de registro se omiten por espacio, asumo que ya existen

  const value = useMemo(() => ({
    user, role, userDoc, loadingUserDoc, 
    // auth
    login, logout, 
    // menú
    menu, 
    loadingMenu, 
    setMenu: saveMenu, // <--- CORRECCIÓN AQUÍ: Ahora Intranet encontrará 'setMenu'
    // pedidos
    pedidosPendientes, pedidosHistorico,
    addPedidoPendiente, updatePedidoStatus, completePedido,
    // preferencia de base
    baseType, setBaseType,
  }), [
    user, role, userDoc, loadingUserDoc,
    menu, loadingMenu, 
    pedidosPendientes, pedidosHistorico, 
    baseType
  ]);

  return <PedidoContext.Provider value={value}>{children}</PedidoContext.Provider>;
}