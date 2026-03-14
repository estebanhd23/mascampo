// src/hooks/useFetchAllUsers.js

import { useState, useEffect } from 'react';
// 🛑 CRÍTICO: Asegúrate de importar subscribeAllUsers desde services/firestore
import { subscribeAllUsers } from '../services/firestore'; 

export default function useFetchAllUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Usamos la función helper subscribeAllUsers que añadimos a firestore.js
        const unsubscribe = subscribeAllUsers((fetchedUsers) => {
            setUsers(fetchedUsers);
            setLoading(false);
            setError(null);
        });

        // Limpieza de la suscripción al desmontar
        return () => unsubscribe();
    }, []);

    return { users, loading, error };
}