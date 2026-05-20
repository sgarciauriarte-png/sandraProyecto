// ==================== LOGIN ====================

const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        
        if (errorMessage) {
            errorMessage.style.display = 'none';
        }
        
        if (!username || !password) {
            showError('Por favor, complete todos los campos');
            return;
        }
        
        try {
            const response = await fetch('/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Guardar todos los datos del usuario
                localStorage.setItem('token', data.access_token);
                localStorage.setItem('username', data.username);
                localStorage.setItem('role', data.role);
                localStorage.setItem('userId', data.user_id);      // ← IMPORTANTE
                localStorage.setItem('userEmail', data.email);     // ← IMPORTANTE
                
                console.log('✅ Datos guardados:', {
                    userId: data.user_id,
                    username: data.username,
                    role: data.role,
                    email: data.email
                });
                
                // Redirigir según el rol
                if (data.role === 'admin') {
                    window.location.href = '/users';
                } else {
                    window.location.href = '/dashboard';
                }
                
            } else {
                const error = await response.json();
                showError(error.detail || 'Usuario o contraseña incorrectos');
            }
            
        } catch (error) {
            console.error('Error de conexión:', error);
            showError('Error de conexión con el servidor');
        }
    });
}

function showError(message) {
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    } else {
        alert(message);
    }
}

// ==================== VERIFICAR AUTENTICACIÓN ====================
function checkAuth() {
    if (window.location.pathname === '/') {
        localStorage.clear();
        return false;
    }
    if (!localStorage.getItem('token')) {
        window.location.replace('/');
        return false;
    }
    return true;
}

checkAuth();

// ==================== MOSTRAR/OCULTAR CONTRASEÑA ====================
const togglePassword = document.getElementById('toggle-password');
const passwordInput = document.getElementById('password');

if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.classList.toggle('fa-eye');
        togglePassword.classList.toggle('fa-eye-slash');
    });
}

console.log('✅ Módulo de login cargado correctamente');