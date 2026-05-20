// ==================== VERIFICAR AUTENTICACIÓN ====================
if (!checkAuth()) {
    window.location.href = '/';
}

// Verificar que sea admin
const role = localStorage.getItem('role');
if (role !== 'admin') {
    alert('No tienes permisos para acceder a esta página');
    window.location.href = '/dashboard';
}

// ==================== OBTENER ID DEL USUARIO LOGUEADO ====================
const CURRENT_USER_ID = localStorage.getItem('userId');
const CURRENT_USERNAME = localStorage.getItem('username');

console.log(`🔑 Usuario logueado: ID=${CURRENT_USER_ID}, Username=${CURRENT_USERNAME}`);

// ==================== VARIABLES GLOBALES ====================
let currentEditId = null;

// ==================== CARGAR USUARIOS ====================
async function loadUsers() {
    try {
        const response = await authFetch('/api/users');
        if (!response) {
            console.error('No se pudo obtener respuesta');
            return;
        }
        
        if (!response.ok) {
            console.error('Error en la respuesta:', response.status);
            if (response.status === 403) {
                alert('No tienes permisos para ver usuarios');
                window.location.href = '/dashboard';
            }
            return;
        }
        
        const users = await response.json();
        const tbody = document.getElementById('users-tbody');
        
        if (!tbody) {
            console.error('No se encontró el elemento users-tbody');
            return;
        }
        
        if (users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                        <i class="fas fa-users" style="font-size: 3em; margin-bottom: 15px; display: block;"></i>
                        No hay usuarios registrados
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = users.map(user => `
            <tr data-user-id="${user.id}">
                <td>${user.id}</td>
                <td><strong>${escapeHtml(user.username)}</strong></td>
                <td>${escapeHtml(user.email)}</td>
                <td>
                    <span class="badge ${user.role === 'admin' ? 'badge-admin' : 'badge-controller'}">
                        ${user.role === 'admin' ? 'Administrador' : 'Controlador'}
                    </span>
                </td>
                <td>
                    <span class="badge ${user.is_active ? 'badge-active' : 'badge-inactive'}">
                        ${user.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                </td>
                <td>${new Date(user.created_at).toLocaleDateString('es-ES')}</td>
                <td>
                    <button class="btn-edit" onclick="editUser(${user.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-danger" onclick="deleteUser(${user.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                 </td>
             </tr>
        `).join('');
        
        console.log(`✅ ${users.length} usuarios cargados`);
        
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        const tbody = document.getElementById('users-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 40px; color: #f44336;">
                        <i class="fas fa-exclamation-circle" style="font-size: 3em; margin-bottom: 15px; display: block;"></i>
                        Error al cargar usuarios
                     </td>
                 </tr>
            `;
        }
    }
}

// ==================== MODAL ====================
const modal = document.getElementById('user-modal');
const btnNewUser = document.getElementById('btn-new-user');
const btnCancel = document.getElementById('btn-cancel');
const closeBtn = document.querySelector('.close');

if (btnNewUser) {
    btnNewUser.addEventListener('click', () => {
        openNewUserModal();
    });
}

if (btnCancel) {
    btnCancel.addEventListener('click', () => {
        closeModal();
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        closeModal();
    });
}

if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

// ==================== FUNCIONES DE MODAL ====================

function openNewUserModal() {
    currentEditId = null;
    
    document.getElementById('modal-title').textContent = 'Nuevo Usuario';
    document.getElementById('user-form').reset();
    document.getElementById('modal-username').disabled = false;
    document.getElementById('password-group').style.display = 'block';
    document.getElementById('modal-password').required = true;
    
    modal.classList.add('show');
    
    setTimeout(() => {
        document.getElementById('modal-username').focus();
    }, 100);
}

function openEditUserModal(user) {
    currentEditId = user.id;
    
    document.getElementById('modal-title').textContent = 'Editar Usuario';
    document.getElementById('modal-username').value = user.username;
    document.getElementById('modal-username').disabled = true;
    document.getElementById('modal-email').value = user.email;
    document.getElementById('modal-role').value = user.role;
    document.getElementById('modal-active').checked = user.is_active;
    
    document.getElementById('password-group').style.display = 'none';
    document.getElementById('modal-password').required = false;
    document.getElementById('modal-password').value = '';
    
    modal.classList.add('show');
    
    setTimeout(() => {
        document.getElementById('modal-email').focus();
    }, 100);
}

function closeModal() {
    modal.classList.remove('show');
    currentEditId = null;
    document.getElementById('user-form').reset();
    document.getElementById('modal-username').disabled = false;
}

// ==================== CREAR/ACTUALIZAR USUARIO ====================

document.getElementById('user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('modal-username').value.trim();
    const email = document.getElementById('modal-email').value.trim();
    const password = document.getElementById('modal-password').value;
    const role = document.getElementById('modal-role').value;
    const is_active = document.getElementById('modal-active').checked;
    
    try {
        if (currentEditId) {
            // ========== ACTUALIZAR USUARIO ==========
            console.log(`📝 Actualizando usuario ID: ${currentEditId}`);
            console.log(`🔑 Usuario logueado ID: ${CURRENT_USER_ID}`);
            
            // Verificar si está editando su propio perfil
            const isEditingSelf = (currentEditId == CURRENT_USER_ID);
            
            console.log(`✏️ ¿Editando propio usuario?: ${isEditingSelf}`);
            
            const response = await authFetch(`/api/users/${currentEditId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email, 
                    role, 
                    is_active 
                })
            });
            
            if (response && response.ok) {
                showNotification('✅ Usuario actualizado exitosamente', 'success');
                closeModal();
                await loadUsers();
                
                // ========== SI EDITÓ SU PROPIO USUARIO ==========
                if (isEditingSelf) {
                    showNotification('🔄 Tus datos han cambiado. Cerrando sesión...', 'info');
                    
                    setTimeout(() => {
                        localStorage.clear();
                        if (typeof ws !== 'undefined' && ws) {
                            ws.close();
                        }
                        window.location.href = '/';
                    }, 2000);
                }
            } else {
                const error = await response.json();
                showNotification(`❌ Error: ${error.detail || 'No se pudo actualizar'}`, 'error');
            }
            
        } else {
            // ========== CREAR USUARIO ==========
            console.log('📝 Creando nuevo usuario');
            
            if (!password || password.length < 8) {
                showNotification('❌ La contraseña debe tener al menos 8 caracteres', 'error');
                return;
            }
            
            const response = await authFetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, 
                    email, 
                    password, 
                    role 
                })
            });
            
            if (response && response.ok) {
                showNotification('✅ Usuario creado exitosamente', 'success');
                closeModal();
                await loadUsers();
            } else {
                const error = await response.json();
                showNotification(`❌ Error: ${error.detail || 'No se pudo crear'}`, 'error');
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('❌ Error de conexión', 'error');
    }
});

// ==================== EDITAR USUARIO ====================

async function editUser(id) {
    console.log(`✏️ Editando usuario ID: ${id}`);
    
    try {
        const response = await authFetch('/api/users');
        if (!response || !response.ok) {
            showNotification('❌ Error al cargar datos del usuario', 'error');
            return;
        }
        
        const users = await response.json();
        const user = users.find(u => u.id === id);
        
        if (user) {
            openEditUserModal(user);
        } else {
            showNotification('❌ Usuario no encontrado', 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('❌ Error al cargar datos del usuario', 'error');
    }
}

// ==================== ELIMINAR USUARIO ====================

async function deleteUser(id) {
    console.log(`🗑️ Intentando eliminar usuario ID: ${id}`);
    
    try {
        const usersResponse = await authFetch('/api/users');
        if (!usersResponse || !usersResponse.ok) {
            showNotification('❌ Error al cargar usuarios', 'error');
            return;
        }
        
        const users = await usersResponse.json();
        const userToDelete = users.find(u => u.id === id);
        
        if (!userToDelete) {
            showNotification('❌ Usuario no encontrado', 'error');
            return;
        }
        
        // No permitir eliminarse a sí mismo
        if (userToDelete.id == CURRENT_USER_ID) {
            showNotification('❌ No puedes eliminarte a ti mismo', 'error');
            return;
        }
        
        if (!confirm(`¿Estás seguro de eliminar al usuario "${userToDelete.username}"?\n\nEsta acción no se puede deshacer.`)) {
            return;
        }
        
        const deleteResponse = await authFetch(`/api/users/${id}`, {
            method: 'DELETE'
        });
        
        if (deleteResponse && deleteResponse.ok) {
            showNotification('✅ Usuario eliminado exitosamente', 'success');
            await loadUsers();
        } else {
            const error = await deleteResponse.json();
            showNotification(`❌ Error: ${error.detail || 'No se pudo eliminar'}`, 'error');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('❌ Error al eliminar usuario', 'error');
    }
}

// ==================== FUNCIÓN PARA ESCAPAR HTML ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== NOTIFICACIONES ====================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 90px;
        right: 20px;
        background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 10001;
        animation: slideInRight 0.3s ease;
        font-size: 0.95em;
        max-width: 350px;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Agregar estilos de animación
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);

// ==================== INICIALIZAR ====================
async function init() {
    if (document.getElementById('users-tbody')) {
        await loadUsers();
    }
}

init();

console.log('✅ Módulo de usuarios cargado correctamente');
console.log(`🔑 Usuario actual: ${CURRENT_USERNAME} (ID: ${CURRENT_USER_ID})`);