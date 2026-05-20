// ==================== INICIALIZACIÓN ====================
let ws = null;

// Si no hay token, regresar al login
if (!localStorage.getItem('token')) {
    window.location.replace('/');
}

if (!checkAuth()) {
    window.location.href = '/';
}

// ==================== CONFIGURACIÓN USUARIO ====================
function setupUserInfo() {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');

    if (username) {
        const initial = username.charAt(0).toUpperCase();
        document.getElementById('user-avatar').textContent = initial;
        document.getElementById('user-name').textContent = username;
        document.getElementById('user-role').textContent = role;
        document.getElementById('welcome-name').textContent = username;
    }

    if (role !== 'admin') {
        const adminSection = document.getElementById('admin-section');
        if (adminSection) adminSection.style.display = 'none';
    }
}

setupUserInfo();

// ==================== MENÚ HAMBURGUESA ====================
const hamburger   = document.getElementById('hamburger');
const sidebar     = document.getElementById('sidebar');
const overlay     = document.getElementById('overlay');
const mainContent = document.getElementById('main-content');

function toggleSidebar() {
    hamburger.classList.toggle('active');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
    if (window.innerWidth > 768) {
        mainContent.classList.toggle('shifted');
    }
}

hamburger.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && !e.target.id.includes('menu')) {
            toggleSidebar();
        }
    });
});

// ==================== MODAL LOGOUT ====================
const logoutModal  = document.getElementById('logout-modal');
const logoutMenu   = document.getElementById('logout-menu');
const cancelLogout = document.getElementById('cancel-logout');
const confirmLogout = document.getElementById('confirm-logout');

logoutMenu.addEventListener('click', (e) => {
    e.preventDefault();
    logoutModal.classList.add('show');
    toggleSidebar();
});

cancelLogout.addEventListener('click', () => {
    logoutModal.classList.remove('show');
});

confirmLogout.addEventListener('click', () => {
    closeWebSocket();
    localStorage.clear();
    window.location.href = '/';
});

logoutModal.addEventListener('click', (e) => {
    if (e.target === logoutModal) logoutModal.classList.remove('show');
});

// ==================== WEBSOCKET CÁMARA ====================
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY   = 2000;

function initCamera() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('❌ No hay token de autenticación');
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/camera`;
    console.log('🔄 Conectando WebSocket a:', wsUrl);

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('✅ WebSocket conectado');
            reconnectAttempts = 0;
            ws.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.error) {
                    console.error('Error del servidor:', data.error);
                    showNotification(data.error, 'error');
                    return;
                }

                // Actualizar imagen de cámara
                if (data.frame) {
                    const feed = document.getElementById('camera-feed');
                    if (feed) feed.src = `data:image/jpeg;base64,${data.frame}`;
                }

                // ✅ Actualizar contadores de entrada/salida/dentro
                const countIn   = data.count_in  ?? 0;
                const countOut  = data.count_out ?? 0;
                const insideNow = Math.max(0, countIn - countOut);

                const elIn   = document.getElementById('count-in');
                const elOut  = document.getElementById('count-out');
                const elInside = document.getElementById('inside-now');

                if (elIn)    elIn.textContent    = countIn;
                if (elOut)   elOut.textContent   = countOut;
                if (elInside) elInside.textContent = insideNow;

                // Actualizar resto de estadísticas
                updateStats(data);
                updateStatusBadges(data);

            } catch (error) {
                console.error('Error procesando mensaje:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
        };

        ws.onclose = (event) => {
            console.log(`🔌 WebSocket cerrado. Código: ${event.code}`);
            if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
                reconnectAttempts++;
                console.log(`🔄 Reintentando en ${delay / 1000}s (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                setTimeout(initCamera, delay);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                showNotification('Error de conexión con el servidor', 'error');
            }
        };

    } catch (error) {
        console.error('❌ Error creando WebSocket:', error);
    }
}

function closeWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Cierre voluntario');
        console.log('🔌 WebSocket cerrado voluntariamente');
    }
}

// ==================== ACTUALIZAR ESTADÍSTICAS ====================
function updateStats(data) {
    // Personas detectadas en este momento
    const peopleStat = document.getElementById('people-stat');
    if (peopleStat) {
        peopleStat.textContent = data.people || 0;
        peopleStat.style.color = data.people > 0 ? '#4caf50' : '#333';
    }

    // Luces
    const lightsStat = document.getElementById('lights-stat');
    const isLightsOn = data.lights === true || data.lights === 'ON';
    if (lightsStat) {
        lightsStat.textContent = isLightsOn ? 'ON' : 'OFF';
        lightsStat.style.color = isLightsOn ? '#ffc107' : '#999';
    }

    // A/C
    const acStat  = document.getElementById('ac-stat');
    const isAcOn  = data.ac === true || data.ac === 'ON';
    if (acStat) {
        acStat.textContent = isAcOn ? 'ON' : 'OFF';
        acStat.style.color = isAcOn ? '#2196f3' : '#999';
    }

    // Consumo
    const powerStat = document.getElementById('power-stat');
    let power = 0;
    if (isLightsOn) power += 100;
    if (isAcOn)     power += 1500;
    if (powerStat) {
        powerStat.textContent = power;
        powerStat.style.color = power > 0 ? '#f44336' : '#999';
    }

    // Confianza simulada
    const camConfidence = document.getElementById('cam-confidence');
    if (camConfidence) {
        camConfidence.textContent = data.people > 0
            ? (Math.random() * 0.3 + 0.65).toFixed(2)
            : '0.00';
    }
}

// ==================== ACTUALIZAR BADGES ====================
function updateStatusBadges(data) {
    try {
        const lightsBadge = document.getElementById('lights-badge');
        const acBadge     = document.getElementById('ac-badge');
        if (lightsBadge) lightsBadge.classList.toggle('active', !!data.lights);
        if (acBadge)     acBadge.classList.toggle('active',     !!data.ac);
    } catch (error) {
        console.error('Error actualizando badges:', error);
    }
}

// ==================== TOGGLES MANUALES ====================
function setupToggles() {
    const lightsToggle = document.getElementById('lights-toggle');
    const acToggle     = document.getElementById('ac-toggle');

    if (lightsToggle) {
        lightsToggle.addEventListener('change', (e) => sendCommand('lights', e.target.checked));
    }
    if (acToggle) {
        acToggle.addEventListener('change', (e) => sendCommand('ac', e.target.checked));
    }
}

function sendCommand(device, state) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showNotification('No hay conexión con el servidor', 'error');
        return;
    }
    try {
        ws.send(JSON.stringify({ type: 'command', device, state }));
    } catch (error) {
        console.error('Error enviando comando:', error);
    }
}

// ==================== NOTIFICACIONES ====================
function showNotification(message, type = 'info') {
    const colors = { success: '#4caf50', error: '#f44336', info: '#2196f3' };
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 90px; right: 20px;
        background: ${colors[type] || colors.info};
        color: white; padding: 12px 20px; border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 10001;
        animation: slideInRight 0.3s ease; font-size: 14px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== MENÚ ITEMS ADICIONALES ====================
document.getElementById('settings-menu')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('⚙️ Configuración - Próximamente disponible');
});

document.getElementById('help-menu')?.addEventListener('click', (e) => {
    e.preventDefault();
    showHelpModal();
});

function showHelpModal() {
    const helpHTML = `
        <div class="modal show" id="help-modal" style="display:flex;">
            <div class="modal-content">
                <div class="modal-icon" style="color:#2196f3;"><i class="fas fa-info-circle"></i></div>
                <h2 class="modal-title">Centro de Ayuda</h2>
                <div style="text-align:left;margin:20px 0;">
                    <h3 style="color:#667eea;margin-bottom:10px;">📹 Monitoreo en Vivo</h3>
                    <p style="color:#666;margin-bottom:15px;">El sistema detecta personas y controla luces y A/C automáticamente.</p>
                    <h3 style="color:#667eea;margin-bottom:10px;">🚶 Conteo de Personas</h3>
                    <p style="color:#666;margin-bottom:15px;">Entradas: de izquierda a derecha. Salidas: de derecha a izquierda. Se reinicia al apagar luces y AC.</p>
                    <h3 style="color:#667eea;margin-bottom:10px;">📊 Consumo</h3>
                    <p style="color:#666;margin-bottom:15px;">Analiza el consumo energético en tiempo real, semanal y mensual.</p>
                    <h3 style="color:#667eea;margin-bottom:10px;">👥 Usuarios (Admin)</h3>
                    <p style="color:#666;margin-bottom:15px;">Gestiona usuarios del sistema (solo administradores).</p>
                </div>
                <button class="btn btn-primary" onclick="document.getElementById('help-modal').remove()">Entendido</button>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', helpHTML);
}

// ==================== ATAJOS DE TECLADO ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (sidebar.classList.contains('active'))  toggleSidebar();
        if (logoutModal.classList.contains('show')) logoutModal.classList.remove('show');
    }
    if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
    }
});

// ==================== RESPONSIVE ====================
let isDesktop = window.innerWidth > 768;
window.addEventListener('resize', () => {
    const wasDesktop = isDesktop;
    isDesktop = window.innerWidth > 768;
    if (wasDesktop !== isDesktop && !isDesktop && sidebar.classList.contains('active')) {
        toggleSidebar();
    }
});

// ==================== ANIMACIONES AL CARGAR ====================
window.addEventListener('load', () => {
    document.querySelectorAll('.stat-card').forEach((card, index) => {
        card.style.opacity    = '0';
        card.style.transform  = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'all 0.5s ease';
            card.style.opacity    = '1';
            card.style.transform  = 'translateY(0)';
        }, index * 100 + 50);
    });
});

// ==================== INACTIVIDAD ====================
let inactivityTimer;
const INACTIVITY_TIME = 30 * 60 * 1000;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        showNotification('Sesión cerrada por inactividad', 'info');
        setTimeout(() => { localStorage.clear(); window.location.href = '/'; }, 2000);
    }, INACTIVITY_TIME);
}

['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer, true);
});
resetInactivityTimer();

// ==================== CSS ANIMACIONES ====================
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(400px); opacity: 0; }
        to   { transform: translateX(0);     opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0);     opacity: 1; }
        to   { transform: translateX(400px); opacity: 0; }
    }
    /* Contadores de personas bajo la cámara */
    .people-counter {
        display: flex;
        align-items: center;
        justify-content: space-around;
        padding: 10px 16px;
        background: rgba(0,0,0,0.03);
        border-top: 1px solid rgba(0,0,0,0.07);
        border-radius: 0 0 12px 12px;
    }
    .counter-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
    }
    .counter-item i         { font-size: 14px; }
    .counter-item.entrada i { color: #4caf50; }
    .counter-item.inside  i { color: #667eea; }
    .counter-item.salida  i { color: #f44336; }
    .counter-label {
        font-size: 10px;
        text-transform: uppercase;
        color: #999;
        letter-spacing: 0.5px;
    }
    .counter-value {
        font-size: 22px;
        font-weight: 700;
        color: #333;
    }
    .counter-item.entrada .counter-value { color: #4caf50; }
    .counter-item.inside  .counter-value { color: #667eea; }
    .counter-item.salida  .counter-value { color: #f44336; }
    .counter-divider {
        width: 1px;
        height: 40px;
        background: rgba(0,0,0,0.1);
    }
`;
document.head.appendChild(style);

// ==================== ARRANQUE ====================
document.addEventListener('DOMContentLoaded', () => {
    setupToggles();
    setTimeout(initCamera, 500);
});

window.addEventListener('beforeunload', closeWebSocket);

console.log('✅ Dashboard inicializado correctamente');