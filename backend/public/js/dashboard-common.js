// Compartido entre los dashboards activos (index, battery, inverter).
// Navegacion (desktop + movil) generada desde una sola lista, el badge de
// estado del sensor/sistema, toasts, numeros animados y sparklines de tarjeta.
// Ver docs/FRONTEND_IMPROVEMENT_PLAN.md.
//
// "Ambiental (AHT20)" se quito de la lista y su pagina (environment.html) se
// borro: el sensor AHT20 ya no esta en uso. "Solar" se quito de la lista pero
// solar.html y su API se dejaron intactos -- el sensor esta desconectado por
// ahora, no removido; reactivar es solo volver a agregar la entrada aqui.
const DASHBOARD_PAGES = [
    { href: '/',                  label: 'BME280 (Clima)',    shortLabel: 'Clima' },
    { href: '/battery.html',      label: 'Batería',           shortLabel: 'Batería' },
    { href: '/inverter',          label: 'Inversor',           shortLabel: 'Inversor' }
];

function initNav(activeHref, sectionLabel) {
    const tabsEl = document.querySelector('.nav-tabs');
    if (tabsEl) {
        tabsEl.innerHTML = DASHBOARD_PAGES.map(p => {
            const isActive = p.href === activeHref;
            const cls = isActive ? 'btn-filter active' : 'btn-filter';
            const style = isActive
                ? 'white-space: nowrap;'
                : 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); white-space: nowrap;';
            const onclick = isActive ? '' : ` onclick="window.location.href='${p.href}'"`;
            return `<button class="${cls}" style="${style}"${onclick}>${p.label}</button>`;
        }).join('');
    }

    const dropdownItemsEl = document.getElementById('mobile-nav-items');
    if (dropdownItemsEl) {
        dropdownItemsEl.innerHTML = DASHBOARD_PAGES.map(p => {
            const cls = p.href === activeHref ? 'nav-item active' : 'nav-item';
            return `<a href="${p.href}" class="${cls}">Monitor: ${p.shortLabel}</a>`;
        }).join('');
    }

    const dropdownLabelEl = document.querySelector('.nav-custom-dropdown span');
    if (dropdownLabelEl && sectionLabel) {
        dropdownLabelEl.textContent = `Sección: ${sectionLabel}`;
    }
}

function toggleMobileNav() {
    const menu = document.getElementById('mobile-nav-items');
    const chev = document.getElementById('nav-chevron');
    if (menu) menu.classList.toggle('show');
    if (chev) chev.style.transform = menu.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
}

// Cerrar menú móvil al hacer clic fuera
window.addEventListener('click', (e) => {
    const menu = document.getElementById('mobile-nav-items');
    if (menu && !e.target.closest('.nav-mobile')) {
        menu.classList.remove('show');
        const chev = document.getElementById('nav-chevron');
        if (chev) chev.style.transform = 'rotate(0deg)';
    }
});

function updateStatusBadge(createdAt, options) {
    const label = (options && options.label) || 'Sensor';
    if (!createdAt) return;

    const dateStr = createdAt.includes('Z') || createdAt.includes('+') ? createdAt : createdAt.replace(' ', 'T') + 'Z';
    const lastRead = new Date(dateStr).getTime();
    const diffMin = (Date.now() - lastRead) / 60000;

    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const seen = document.getElementById('last-seen');

    if (dot) {
        dot.classList.remove('online', 'delayed', 'offline');
        if (diffMin < 2) {
            dot.classList.add('online');
            if (text) { text.innerText = `${label} Online`; text.style.color = 'var(--success)'; }
        } else if (diffMin < 10) {
            dot.classList.add('delayed');
            if (text) { text.innerText = `${label} Demorado`; text.style.color = 'var(--warning)'; }
        } else {
            dot.classList.add('offline');
            if (text) { text.innerText = `${label} Desconectado`; text.style.color = 'var(--secondary)'; }
        }
    }

    if (seen) {
        if (diffMin < 1) {
            seen.innerText = 'Visto ahora mismo';
        } else if (diffMin < 60) {
            seen.innerText = `Visto hace ${Math.floor(diffMin)} min`;
        } else {
            seen.innerText = `Visto hace ${Math.floor(diffMin / 60)}h ${Math.floor(diffMin % 60)}m`;
        }
    }
}

// --- Toast notifications ---
// Cada pagina necesita <div id="toast-container" class="toast-container"></div>
// una sola vez en el <body>.
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';
    if (type === 'warning') icon = 'alert-triangle';

    toast.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span style="font-size: 0.85rem; font-weight: 500;">${message}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        toast.style.animation = 'toast-out 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- Numeros animados ---
// Reemplaza un salto brusco de valor por una transicion corta. Si el elemento
// todavia tiene la clase "skeleton" (placeholder de carga), la quita y fija el
// valor de una vez, sin animar la primera aparicion del dato.
function animateValue(el, newValue, decimals) {
    decimals = decimals || 0;
    if (!el) return;

    if (newValue === undefined || newValue === null || newValue === '' || isNaN(Number(newValue))) {
        el.textContent = '--';
        return;
    }

    const targetText = Number(newValue).toFixed(decimals);

    if (el.classList.contains('skeleton')) {
        el.classList.remove('skeleton');
        el.textContent = targetText;
        return;
    }

    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const current = parseFloat(String(el.textContent).replace(/[^\d.-]/g, ''));
    const target = Number(newValue);

    if (prefersReduced || isNaN(current) || current === target) {
        el.textContent = targetText;
        return;
    }

    // Token de animacion: invalida cualquier rAF anterior en el mismo elemento
    // si llega un dato nuevo antes de que termine (ej. via socket cada pocos segundos).
    const token = (el._animToken = (el._animToken || 0) + 1);
    const duration = 500;
    const start = performance.now();
    const from = current;

    function step(now) {
        if (el._animToken !== token) return;
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = (from + (target - from) * eased).toFixed(decimals);
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            el.textContent = targetText;
        }
    }
    requestAnimationFrame(step);
}

// --- Sparklines ---
// Dibuja una linea de tendencia liviana en SVG dentro de un contenedor
// ".card-sparkline". "values" es un arreglo de numeros (los mas recientes al
// final); "color" es un color CSS valido (hex o var() resuelto).
let _sparklineIdCounter = 0;

function renderSparkline(container, values, color) {
    if (!container) return;
    const nums = (values || []).filter(v => v !== null && v !== undefined && !isNaN(v));
    if (nums.length < 2) {
        container.innerHTML = '';
        return;
    }

    const width = 100;
    const height = 32;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = (max - min) || 1;

    const points = nums.map((v, i) => {
        const x = (i / (nums.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    const gradId = `spark-grad-${++_sparklineIdCounter}`;
    const linePoints = points.join(' ');
    const areaPoints = `0,${height} ${linePoints} ${width},${height}`;
    const c = color || '#6366f1';

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${c}" stop-opacity="0.35"></stop>
                    <stop offset="100%" stop-color="${c}" stop-opacity="0"></stop>
                </linearGradient>
            </defs>
            <polygon points="${areaPoints}" fill="url(#${gradId})" stroke="none"></polygon>
            <polyline points="${linePoints}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline>
        </svg>
    `;
}
