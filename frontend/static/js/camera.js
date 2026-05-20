let ws = null;

function initCamera() {
    const token = localStorage.getItem('token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Conectar sin pasar el token en la URL (no es necesario para WebSocket en este caso)
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/camera`);
    
    ws.onopen = () => {
        console.log('✅ WebSocket conectado');
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Verificar si hay error
            if (data.error) {
                console.error('Error desde servidor:', data.error);
                const cameraFeed = document.getElementById('camera-feed');
                cameraFeed.alt = data.error;
                return;
            }
            
            // Actualizar imagen
            const cameraFeed = document.getElementById('camera-feed');
            cameraFeed.src = `data:image/jpeg;base64,${data.frame}`;
            
            // Actualizar contador de personas
            const peopleCount = document.getElementById('people-count');
            if (peopleCount) {
                peopleCount.textContent = data.people || 0;
            }
            
            // Actualizar indicadores
            const lightsIndicator = document.getElementById('lights-indicator');
            const acIndicator = document.getElementById('ac-indicator');
            
            if (lightsIndicator) {
                if (data.lights) {
                    lightsIndicator.classList.add('active');
                } else {
                    lightsIndicator.classList.remove('active');
                }
            }
            
            if (acIndicator) {
                if (data.ac) {
                    acIndicator.classList.add('active');
                } else {
                    acIndicator.classList.remove('active');
                }
            }
        } catch (error) {
            console.error('Error procesando mensaje:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
    };
    
    ws.onclose = (event) => {
        console.log('🔌 WebSocket cerrado, reconectando en 3 segundos...');
        setTimeout(initCamera, 3000);
    };
}

// Iniciar cámara si estamos en la página correcta
if (document.getElementById('camera-feed')) {
    // Esperar un poco para asegurar que el DOM esté listo
    setTimeout(initCamera, 500);
}

// Limpiar al salir
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});