// Compartido entre los 5 dashboards (index, battery, solar, environment, inverter).
// Navegacion (desktop + movil) generada desde una sola lista, y el badge de
// estado del sensor/sistema. Ver docs/FRONTEND_IMPROVEMENT_PLAN.md.

const DASHBOARD_PAGES = [
    { href: '/',                  label: 'BME280 (Clima)',    shortLabel: 'Clima' },
    { href: '/environment.html',  label: 'Ambiental (AHT20)', shortLabel: 'Ambiente' },
    { href: '/battery.html',      label: 'Batería',           shortLabel: 'Batería' },
    { href: '/solar.html',        label: 'Solar',              shortLabel: 'Solar' },
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
