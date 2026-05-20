// ==================== VERIFICAR AUTENTICACIÓN ====================
if (!checkAuth()) {
    window.location.href = '/';
}

// Configurar información de usuario
function setupUserInfo() {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    
    if (username) {
        const initial = username.charAt(0).toUpperCase();
        document.getElementById('user-avatar').textContent = initial;
        document.getElementById('user-name').textContent = username;
        document.getElementById('user-role').textContent = role;
    }
    
    // Ocultar menú admin si no es admin
    if (role !== 'admin') {
        const adminSection = document.getElementById('admin-section');
        if (adminSection) {
            adminSection.style.display = 'none';
        }
    }
}

setupUserInfo();

// ==================== VARIABLES GLOBALES ====================
let realtimeChart, weeklyChart, monthlyChart;
let realtimeData = [];
let updateInterval;

// ==================== CONFIGURACIÓN DE GRÁFICAS ====================
const chartColors = {
    primary: '#667eea',
    secondary: '#764ba2',
    success: '#4caf50',
    warning: '#ff9800',
    danger: '#f44336',
    info: '#2196f3'
};

const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: true,
            position: 'top',
            labels: {
                usePointStyle: true,
                padding: 15,
                font: {
                    size: 12,
                    family: "'Segoe UI', sans-serif"
                }
            }
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            borderColor: chartColors.primary,
            borderWidth: 1,
            titleFont: {
                size: 14,
                weight: 'bold'
            },
            bodyFont: {
                size: 13
            },
            cornerRadius: 8
        }
    },
    interaction: {
        intersect: false,
        mode: 'index'
    }
};

// ==================== GRÁFICA EN TIEMPO REAL ====================
async function initRealtimeChart() {
    const ctx = document.getElementById('realtime-chart').getContext('2d');
    
    realtimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Consumo (W)',
                    data: [],
                    borderColor: chartColors.primary,
                    backgroundColor: createGradient(ctx, chartColors.primary),
                    tension: 0.4,
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#fff',
                    pointBorderWidth: 2
                },
                {
                    label: 'Personas Detectadas',
                    data: [],
                    borderColor: chartColors.warning,
                    backgroundColor: 'transparent',
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    borderDash: [5, 5],
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            ...chartOptions,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Potencia (W)',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    max: 10,
                    title: {
                        display: true,
                        text: 'Personas',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                },
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        maxRotation: 0,
                        autoSkipPadding: 20
                    }
                }
            },
            animation: {
                duration: 750,
                easing: 'easeInOutQuart'
            }
        }
    });
    
    // Actualizar cada 2 segundos
    updateInterval = setInterval(updateRealtimeChart, 2000);
    updateRealtimeChart();
}

// Crear gradiente para las gráficas
function createGradient(ctx, color) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, color + '40');
    gradient.addColorStop(1, color + '00');
    return gradient;
}

// Actualizar datos en tiempo real
async function updateRealtimeChart() {
    try {
        const response = await authFetch('/api/consumption/realtime');
        if (!response || !response.ok) return;
        
        const data = await response.json();
        
        if (data.length === 0) return;
        
        // Limitar a últimos 30 datos
        const limitedData = data.slice(-30);
        
        realtimeChart.data.labels = limitedData.map(d => {
            const date = new Date(d.timestamp);
            return date.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
            });
        });
        
        realtimeChart.data.datasets[0].data = limitedData.map(d => d.power);
        realtimeChart.data.datasets[1].data = limitedData.map(d => d.people);
        
        realtimeChart.update('none');
        
        // Actualizar estadística de consumo actual
        const currentPower = limitedData[limitedData.length - 1]?.power || 0;
        document.getElementById('current-power').textContent = currentPower.toFixed(0) + ' W';
        
    } catch (error) {
        console.error('Error actualizando gráfica en tiempo real:', error);
    }
}

// ==================== GRÁFICA SEMANAL (MEJORADA) ====================
async function initWeeklyChart() {
    const ctx = document.getElementById('weekly-chart').getContext('2d');
    
    try {
        const response = await authFetch('/api/consumption/daily');
        if (!response || !response.ok) {
            console.error('Error cargando datos semanales');
            showEmptyChart(ctx, 'No hay datos semanales disponibles');
            return;
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0) {
            console.warn('No hay datos semanales disponibles');
            showEmptyChart(ctx, 'No hay datos semanales disponibles');
            return;
        }
        
        weeklyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => {
                    const date = new Date(d.date);
                    return date.toLocaleDateString('es-ES', { 
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short'
                    });
                }),
                datasets: [{
                    label: 'Consumo (kWh)',
                    data: data.map(d => d.kwh || 0),
                    backgroundColor: createBarGradient(ctx, chartColors.info),
                    borderColor: chartColors.info,
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Energía (kWh)',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
        
        // Calcular y mostrar consumo semanal
        const weeklyTotal = data.reduce((sum, d) => sum + (d.kwh || 0), 0);
        document.getElementById('weekly-kwh').textContent = weeklyTotal.toFixed(2) + ' kWh';
        
        // Calcular consumo de hoy
        if (data.length > 0) {
            const today = data[data.length - 1].kwh || 0;
            document.getElementById('daily-kwh').textContent = today.toFixed(2) + ' kWh';
        }
        
        console.log('✅ Gráfica semanal cargada:', data.length, 'días');
        
    } catch (error) {
        console.error('Error cargando gráfica semanal:', error);
    }
}

// ==================== GRÁFICA MENSUAL (MEJORADA) ====================
async function initMonthlyChart() {
    const ctx = document.getElementById('monthly-chart').getContext('2d');
    
    try {
        const response = await authFetch('/api/consumption/monthly');
        if (!response || !response.ok) {
            console.error('Error cargando datos mensuales');
            showEmptyChart(ctx, 'No hay datos mensuales disponibles');
            return;
        }
        
        const data = await response.json();
        
        console.log('Datos mensuales recibidos:', data);
        
        if (!data || data.length === 0) {
            console.warn('No hay datos mensuales disponibles');
            showEmptyChart(ctx, 'No hay datos mensuales disponibles');
            document.getElementById('monthly-kwh').textContent = '0.00 kWh';
            return;
        }
        
        monthlyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => {
                    if (d.month) {
                        const [year, month] = d.month.split('-');
                        const date = new Date(year, parseInt(month) - 1);
                        return date.toLocaleDateString('es-ES', { 
                            month: 'short',
                            year: 'numeric'
                        });
                    }
                    return 'N/A';
                }),
                datasets: [{
                    label: 'Consumo (kWh)',
                    data: data.map(d => d.kwh || 0),
                    borderColor: chartColors.success,
                    backgroundColor: createGradient(ctx, chartColors.success),
                    tension: 0.4,
                    fill: true,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#fff',
                    pointBorderWidth: 2,
                    pointBorderColor: chartColors.success
                }]
            },
            options: {
                ...chartOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Energía (kWh)',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                }
            }
        });
        
        // Calcular consumo mensual (último mes)
        const lastMonthKwh = data.length > 0 ? (data[data.length - 1].kwh || 0) : 0;
        document.getElementById('monthly-kwh').textContent = lastMonthKwh.toFixed(2) + ' kWh';
        
        console.log('✅ Gráfica mensual cargada:', data.length, 'meses');
        
    } catch (error) {
        console.error('Error cargando gráfica mensual:', error);
    }
}

// ==================== MOSTRAR GRÁFICA VACÍA ====================
function showEmptyChart(ctx, message) {
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Sin datos'],
            datasets: [{
                label: message,
                data: [0],
                borderColor: '#ccc',
                backgroundColor: 'rgba(200, 200, 200, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            }
        }
    });
}

// ==================== CREAR GRADIENTE PARA BARRAS ====================
function createBarGradient(ctx, color) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + '80');
    return gradient;
}

// ==================== FILTROS DE TIEMPO REAL (FUNCIONALES) ====================
let currentPeriod = 1; // minutos

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Remover active de todos
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        
        // Agregar active al clickeado
        e.target.classList.add('active');
        
        currentPeriod = parseInt(e.target.dataset.period);
        console.log(`✅ Filtro cambiado a: ${currentPeriod} minuto(s)`);
        
        // Actualizar gráfica inmediatamente
        updateRealtimeChart();
    });
});

// Actualizar datos en tiempo real (con filtro)
async function updateRealtimeChart() {
    try {
        const response = await authFetch('/api/consumption/realtime');
        if (!response || !response.ok) return;
        
        const data = await response.json();
        
        if (data.length === 0) return;
        
        // Filtrar datos según el período seleccionado
        const now = new Date();
        const periodMs = currentPeriod * 60 * 1000; // convertir minutos a milisegundos
        
        const filteredData = data.filter(d => {
            const dataTime = new Date(d.timestamp);
            return (now - dataTime) <= periodMs;
        });
        
        // Si no hay datos filtrados, usar los últimos 30
        const displayData = filteredData.length > 0 ? filteredData : data.slice(-30);
        
        realtimeChart.data.labels = displayData.map(d => {
            const date = new Date(d.timestamp);
            return date.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
            });
        });
        
        realtimeChart.data.datasets[0].data = displayData.map(d => d.power || 0);
        realtimeChart.data.datasets[1].data = displayData.map(d => d.people || 0);
        
        realtimeChart.update('none');
        
        // Actualizar estadística de consumo actual
        const currentPower = displayData[displayData.length - 1]?.power || 0;
        document.getElementById('current-power').textContent = currentPower.toFixed(0) + ' W';
        
        // Actualizar tendencia
        if (displayData.length > 1) {
            const prevPower = displayData[displayData.length - 2]?.power || 0;
            const trend = currentPower > prevPower ? 'up' : currentPower < prevPower ? 'down' : 'neutral';
            const trendElement = document.getElementById('power-trend');
            
            trendElement.className = `summary-trend ${trend}`;
            const percentage = prevPower > 0 ? Math.abs(((currentPower - prevPower) / prevPower) * 100).toFixed(1) : 0;
            
            const icon = trend === 'up' ? 'fa-arrow-up' : trend === 'down' ? 'fa-arrow-down' : 'fa-minus';
            trendElement.innerHTML = `
                <i class="fas ${icon}"></i>
                <span>${percentage}%</span>
            `;
        }
        
    } catch (error) {
        console.error('Error actualizando gráfica en tiempo real:', error);
    }
}

// ==================== CALCULAR TENDENCIAS ====================
function calculateTrend(current, previous) {
    if (previous === 0) return 0;
    return ((current - previous) / previous * 100).toFixed(1);
}

// Actualizar tendencias (simulado)
function updateTrends() {
    // Estas tendencias deberían calcularse con datos reales del servidor
    document.getElementById('daily-trend').textContent = '15%';
    document.getElementById('weekly-trend').textContent = '8%';
    document.getElementById('monthly-trend').textContent = '12%';
}

// ==================== ACTUALIZAR ESTADÍSTICAS ====================
async function updateAllStats() {
    try {
        // Actualizar gráfica semanal
        const weeklyResponse = await authFetch('/api/consumption/daily');
        if (weeklyResponse && weeklyResponse.ok) {
            const weeklyData = await weeklyResponse.json();
            
            if (weeklyData.length > 0) {
                weeklyChart.data.labels = weeklyData.map(d => {
                    const date = new Date(d.date);
                    return date.toLocaleDateString('es-ES', { 
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short'
                    });
                });
                weeklyChart.data.datasets[0].data = weeklyData.map(d => d.kwh);
                weeklyChart.update();
                
                const weeklyTotal = weeklyData.reduce((sum, d) => sum + d.kwh, 0);
                document.getElementById('weekly-kwh').textContent = weeklyTotal.toFixed(2) + ' kWh';
                
                const today = weeklyData[weeklyData.length - 1]?.kwh || 0;
                document.getElementById('daily-kwh').textContent = today.toFixed(2) + ' kWh';
            }
        }
        
        // Actualizar gráfica mensual
        const monthlyResponse = await authFetch('/api/consumption/monthly');
        if (monthlyResponse && monthlyResponse.ok) {
            const monthlyData = await monthlyResponse.json();
            
            if (monthlyData.length > 0) {
                monthlyChart.data.labels = monthlyData.map(d => {
                    if (d.month) {
                        const [year, month] = d.month.split('-');
                        const date = new Date(year, month - 1);
                        return date.toLocaleDateString('es-ES', { 
                            month: 'short',
                            year: 'numeric'
                        });
                    }
                    return 'N/A';
                });
                monthlyChart.data.datasets[0].data = monthlyData.map(d => d.kwh);
                monthlyChart.update();
                
                const monthlyTotal = monthlyData.reduce((sum, d) => sum + d.kwh, 0);
                document.getElementById('monthly-kwh').textContent = monthlyTotal.toFixed(2) + ' kWh';
            }
        }
        
    } catch (error) {
        console.error('Error actualizando estadísticas:', error);
    }
}

// ==================== EXPORTAR DATOS ====================
function exportData(format) {
    // Función para exportar datos (CSV, PDF, etc.)
    alert(`Exportando datos en formato ${format}... (Función por implementar)`);
}

// ==================== INICIALIZACIÓN ====================
async function init() {
    console.log('🔄 Inicializando gráficas de consumo...');
    
    try {
        await initRealtimeChart();
        await initWeeklyChart();
        await initMonthlyChart();
        updateTrends();
        
        console.log('✅ Gráficas inicializadas correctamente');
        
        // Actualizar estadísticas cada 30 segundos
        setInterval(updateAllStats, 30000);
        
    } catch (error) {
        console.error('❌ Error inicializando gráficas:', error);
    }
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ==================== LIMPIAR AL SALIR ====================
window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    
    // Destruir gráficas
    if (realtimeChart) realtimeChart.destroy();
    if (weeklyChart) weeklyChart.destroy();
    if (monthlyChart) monthlyChart.destroy();
});

// ==================== ANIMACIONES AL CARGAR ====================
window.addEventListener('load', () => {
    const cards = document.querySelectorAll('.summary-card, .chart-card');
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, 50);
        }, index * 100);
    });
});

console.log('✅ Módulo de consumo cargado correctamente');