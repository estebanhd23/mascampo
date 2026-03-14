// src/hooks/useFetchLastOrder.js

import { useState, useEffect } from 'react';
// IMPORTANTE: Ajusta la ruta a tu instancia de db (puede ser '../firebase/config' o '../firebase')
import { db } from '../firebase'; 
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  Timestamp // Necesario si usas Timestamp para ordenar
} from 'firebase/firestore';
import { usePedido } from '../context/PedidoContext'; // Usamos usePedido para el usuario/rol


const useFetchLastOrder = () => {
  const { user } = usePedido(); // Obtener el usuario actual
  const [lastOrder, setLastOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // El uid del usuario autenticado es el ID del restaurante
    const restaurantId = user.uid;

    // 1. Crear la consulta
    const ordersRef = collection(db, "orders");
    const q = query(
      ordersRef,
      // Filtramos solo las órdenes de este restaurante
      where("userId", "==", restaurantId),
      // Ordenamos por fecha de creación (asumo que tienes un campo 'createdAt' de tipo Timestamp)
      orderBy("createdAt", "desc"), 
      // Limitamos a 1 para obtener la más reciente
      limit(1)
    );

    // 2. Suscribirse a los cambios en tiempo real
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setLoading(false);
        if (!snapshot.empty) {
          // Mapeamos el primer documento
          const doc = snapshot.docs[0];
          setLastOrder({ id: doc.id, ...doc.data() });
        } else {
          // Si no hay pedidos previos
          setLastOrder(null);
        }
      }, 
      (err) => {
        // Manejo de errores
        console.error("Error al cargar el último pedido:", err);
        setError("Error al cargar el último pedido.");
        setLoading(false);
      }
    );

    // Limpieza de la suscripción
    return () => unsubscribe();
  }, [user]); // Se ejecuta cada vez que el usuario cambia

  return { lastOrder, loading, error };
};

export default useFetchLastOrder;