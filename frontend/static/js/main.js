// ==================== main.js CORREGIDO ====================

// Verificar autenticación
// ==================== VERIFICAR AUTENTICACIÓN ====================
function checkAuth() {
    const token = localStorage.getItem('token');

    // SI estamos en login → limpiar siempre y no redirigir
    if (window.location.pathname === '/') {
        localStorage.clear();
        return false;
    }

    // SI no hay token en otra página → mandar al login
    if (!token) {
        window.location.href = '/';
        return false;
    }

    // Mostrar info del usuario
    const userInfo = document.getElementById('user-info');
    if (userInfo) {
        userInfo.textContent = `${localStorage.getItem('username')} (${localStorage.getItem('role')})`;
    }

    // Ocultar menú usuarios si no es admin
    if (localStorage.getItem('role') !== 'admin') {
        const menuUsers = document.getElementById('menu-users');
        if (menuUsers) menuUsers.style.display = 'none';
    }

    return true;
}

// Inicializar
if (window.location.pathname !== '/reset-password') {
    checkAuth();
}

// ==================== FUNCIÓN PARA FETCH CON AUTENTICACIÓN ====================
async function authFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    
    if (!token) {
        console.error('No hay token de autenticación');
        window.location.href = '/';
        return null;
    }
    
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    };
    
    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers,
        },
    };
    
    try {
        const response = await fetch(url, mergedOptions);
        
        if (response.status === 401 || response.status === 403) {
            console.error('Token inválido o expirado');
            localStorage.clear();
            window.location.href = '/';
            return null;
        }
        
        return response;
    } catch (error) {
        console.error('Error en authFetch:', error);
        return null;
    }
}
// ==================== CERRAR SESIÓN ====================
function logout() {
    localStorage.clear();
    if (typeof ws !== 'undefined' && ws) {
        ws.close();
    }
    window.location.href = '/';
}

// Logout button
const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}
console.log('✅ main.js cargado correctamente');

// Inicializar - solo si no es la página de login
if (window.location.pathname !== '/' && window.location.pathname !== '/reset-password') {
    checkAuth();
}