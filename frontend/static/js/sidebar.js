// ==================== SIDEBAR COMPARTIDO ====================

// Configuración usuario
function setupUserInfo() {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    
    if (username) {
        const initial = username.charAt(0).toUpperCase();
        document.getElementById('user-avatar').textContent = initial;
        document.getElementById('user-name').textContent = username;
        document.getElementById('user-role').textContent = role;
    }
}

setupUserInfo();

// Toggle sidebar
const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
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

// Logout modal
const logoutModal = document.getElementById('logout-modal');
const logoutMenu = document.getElementById('logout-menu');
const cancelLogout = document.getElementById('cancel-logout');
const confirmLogout = document.getElementById('confirm-logout');

logoutMenu.addEventListener('click', (e) => {
    e.preventDefault();
    logoutModal.classList.add('show');
    if (sidebar.classList.contains('active')) {
        toggleSidebar();
    }
});

cancelLogout.addEventListener('click', () => {
    logoutModal.classList.remove('show');
});

confirmLogout.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/';
});

logoutModal.addEventListener('click', (e) => {
    if (e.target === logoutModal) {
        logoutModal.classList.remove('show');
    }
});

// Atajos de teclado
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (sidebar.classList.contains('active')) {
            toggleSidebar();
        }
        if (logoutModal.classList.contains('show')) {
            logoutModal.classList.remove('show');
        }
    }
});