# Plan de Implementación: Frontend (Dashboard Web)

> **Para quien ejecute este plan:** cada tarea termina con su propio commit y se puede probar de forma aislada abriendo la página en el navegador. No toca ningún firmware. Usa `anthropic-skills:subagent-driven-development` o `anthropic-skills:executing-plans` si quieres delegar la ejecución tarea por tarea.

**Objetivo:** eliminar la clase de bug que ya nos mordió una vez (lógica copiada y pegada entre las 5 páginas del dashboard que se desincroniza con el tiempo) y cerrar dos huecos de navegación reales que encontré al revisar el frontend a fondo.

**Ya resuelto (commit `4987bad`):** favicon real en las 5 páginas (antes no existía ningún `<link rel="icon">`, y las notificaciones de escritorio apuntaban a un `/favicon.ico` que nunca existió) + `aria-label` en los 24 botones de solo-ícono de las 5 páginas.

**Ya resuelto (commit `f742bfa`):** Fases A y B completas — `backend/public/js/dashboard-common.js` creado con `DASHBOARD_PAGES`/`initNav`/`toggleMobileNav`/`updateStatusBadge` compartidos; las 5 páginas migradas; CSS del menú móvil centralizado en `style.css`. Verificado en navegador: `index.html` y `environment.html` ahora se enlazan mutuamente (antes no), `environment.html` tiene menú móvil por primera vez, y cada badge de estado sigue reflejando datos reales sin errores de consola. Queda pendiente solo la Fase C (opcional, baja prioridad).

**Arquitectura:** un archivo JS compartido (`backend/public/js/dashboard-common.js`) y las reglas CSS del menú móvil movidas de bloques `<style>` duplicados por página a `style.css`. Cero build step, cero dependencias nuevas — sigue siendo HTML/CSS/JS puro, coherente con el resto del proyecto.

## Restricciones globales

- No cambiar el formato de los eventos de Socket.io ni las rutas de la API — solo el frontend.
- Mantener el diseño visual actual (Glassmorphism, misma paleta) — esto es refactor, no rediseño.
- Cada página debe seguir funcionando exactamente igual si se abre directo (sin depender de un build step).

---

## Hallazgos que motivan este plan (verificados, no hipotéticos)

- El menú de navegación **no es igual en las 5 páginas**: `index.html` no enlaza a `/environment.html` en ninguna parte de su navegación, y `environment.html` no enlaza a `/inverter`. Cada página mantiene su propia lista de enlaces a mano y se desincronizaron.
- `environment.html` es la única de las 5 páginas **sin menú de navegación móvil**: no tiene el bloque `<style>` con `@media (max-width: 768px)` que las otras 4 sí tienen, ni el `<div class="nav-mobile">`, ni la función `toggleMobileNav()`. En pantallas angostas, sus botones de navegación de escritorio (`.nav-tabs`) no tienen ningún tratamiento responsivo.
- El CSS del dropdown móvil que sí existe en las otras 4 páginas **ya divergió entre sí** (el de `battery.html` tiene reglas extra que `index.html` no tiene) — evidencia de que copiar y pegar por página ya está costando consistencia, no es un riesgo teórico.
- `updateStatusBadge` está duplicada en las 5 páginas. En `index.html`, `solar.html` y `environment.html` es prácticamente idéntica (texto "Sensor Online/Demorado/Desconectado"); en `battery.html` tiene chequeos `null` extra; en `inverter.html` (ya arreglada en la sesión anterior) usa un texto distinto ("Sistema Online/Demorado/Offline") y una estructura de código diferente. Es exactamente el mismo patrón que causó el bug que corregimos ahí.

---

## Fase A — Navegación centralizada (desktop + móvil)

### Tarea A.1: Mover el CSS del menú móvil a `style.css`

**Archivos:**
- Modificar: `backend/public/style.css` (agregar al final)
- Modificar: `backend/public/index.html`, `battery.html`, `solar.html`, `inverter.html` (quitar el bloque `<style>` del `<head>`)
- Modificar: `backend/public/environment.html` (no tiene nada que quitar, se beneficia directo)

- [ ] **Paso 1:** Agregar a `backend/public/style.css` (usa la versión de `index.html` como base — es la más simple de las 4, sin las reglas extra que solo aplican a componentes de esa página, como `.battery-pack-container` de `battery.html`, que se quedan en el `<style>` local de esa página):

```css
/* ============================================
   Navegacion movil (compartida entre dashboards)
   ============================================ */
@media (max-width: 768px) {
    header {
        flex-direction: column;
        align-items: center !important;
        text-align: center;
        gap: 1.5rem;
    }
    .header-actions {
        width: 100%;
        justify-content: center;
    }
    .nav-tabs {
        display: none !important;
    }
    .nav-mobile {
        display: block !important;
        width: 100%;
        margin-top: 1rem;
        position: relative;
    }
    .nav-custom-dropdown {
        width: 100%;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 14px;
        color: white;
        padding: 0.9rem 1.3rem;
        font-size: 1rem;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    .nav-custom-dropdown:active {
        transform: scale(0.98);
        background: rgba(255,255,255,0.12);
    }
    .nav-dropdown-items {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        width: 100%;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(15px);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 14px;
        z-index: 9999;
        overflow: hidden;
        box-shadow: 0 15px 35px rgba(0,0,0,0.5);
    }
    .nav-dropdown-items.show {
        display: block;
        animation: slideUp 0.3s ease;
    }
    .nav-item {
        padding: 1.1rem 1.4rem;
        color: rgba(255,255,255,0.8);
        text-decoration: none;
        display: block;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        transition: all 0.2s;
    }
    .nav-item:last-child { border-bottom: none; }
    .nav-item:active { background: rgba(255,255,255,0.1); }
    .nav-item.active {
        background: linear-gradient(135deg, rgba(96, 165, 250, 0.2), rgba(16, 185, 129, 0.1));
        color: white;
        font-weight: 700;
    }
}
.nav-mobile { display: none; }

@keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Paso 2:** En `index.html`, `battery.html`, `solar.html` e `inverter.html`, borrar del bloque `<style>` del `<head>` **solo** las reglas que acabas de mover (el `@media (max-width: 768px) { header, .header-actions, .nav-tabs, .nav-mobile, .nav-custom-dropdown, .nav-dropdown-items, .nav-item }`, la línea suelta `.nav-mobile { display: none; }` y el `@keyframes slideUp`). Deja intactas las reglas específicas de esa página (por ejemplo, en `battery.html` no toques `.battery-pack-container`, `.cell-volt`, `.toast-container`, etc.). Si después de borrar queda un `<style>` vacío, bórralo también junto con sus etiquetas.

- [ ] **Paso 3:** Verificar visualmente cada página en el navegador (ancho de escritorio y móvil, usa `resize_window` a preset `mobile` si tienes el Browser pane) — el dropdown de navegación debe verse y comportarse igual que antes de mover el CSS.

- [ ] **Paso 4:** Commit

```bash
git add backend/public/style.css backend/public/index.html backend/public/battery.html backend/public/solar.html backend/public/inverter.html
git commit -m "refactor: centralize mobile nav dropdown CSS in style.css"
```

### Tarea A.2: `dashboard-common.js` — navegación generada desde una sola lista

**Archivos:**
- Crear: `backend/public/js/dashboard-common.js`
- Modificar: las 5 páginas (agregar el `<script>`, reemplazar el HTML de navegación hardcodeado por contenedores vacíos, llamar `initNav()`)

**Interfaces:**
- Produce: `DASHBOARD_PAGES`, `initNav(activeHref, sectionLabel)`, `toggleMobileNav()` — usados por las 5 páginas y por la Tarea B.1.

- [ ] **Paso 1:** Crear `backend/public/js/dashboard-common.js`:

```js
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
```

- [ ] **Paso 2:** En cada página, agregar el script **antes** del resto de scripts inline (justo después de `<script src="lib/socket.io.min.js"></script>`, o al final del `<head>`):

```html
<script src="js/dashboard-common.js"></script>
```

- [ ] **Paso 3:** En cada página, reemplazar el `<div class="nav-tabs" ...>...</div>` hardcodeado por un contenedor vacío (conserva el `style` inline de layout, por ejemplo en `index.html`):

```html
<div class="nav-tabs" style="margin-top: 1rem; display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 5px; -webkit-overflow-scrolling: touch;"></div>
```

- [ ] **Paso 4:** En `index.html`, `battery.html`, `solar.html` e `inverter.html`, reemplazar el `<div class="nav-mobile">...</div>` completo (con sus enlaces hardcodeados) por la versión vacía:

```html
<div class="nav-mobile">
    <div class="nav-custom-dropdown" onclick="toggleMobileNav()">
        <span>Sección: --</span>
        <i data-lucide="chevron-down" id="nav-chevron"></i>
    </div>
    <div class="nav-dropdown-items" id="mobile-nav-items"></div>
</div>
```

En `environment.html`, este bloque no existe todavía — agrégalo completo, en el mismo lugar donde está `index.html` (dentro del header, después de `.nav-tabs`).

- [ ] **Paso 5:** Borrar de cada página la función local `toggleMobileNav()` (ahora viene de `dashboard-common.js`) y, si existía, el `<div class="nav-mobile">{...}</div>` viejo con los enlaces a mano ya reemplazado en el Paso 4.

- [ ] **Paso 6:** Al final de cada página, junto a donde ya se llama `initChart(); fetchReadings();`, agregar la llamada a `initNav()` con el `href` y la etiqueta de esa página. Por ejemplo, en `index.html`:

```js
initNav('/', 'Clima');
```

En `battery.html`: `initNav('/battery.html', 'Batería');`
En `solar.html`: `initNav('/solar.html', 'Solar');`
En `environment.html`: `initNav('/environment.html', 'Ambiente');`
En `inverter.html`: `initNav('/inverter', 'Inversor');`

- [ ] **Paso 7:** Verificar cada una de las 5 páginas en el navegador: que la navegación de escritorio y el dropdown móvil muestren los 5 enlaces (incluyendo ahora `Ambiente` en todas, y `Inversor` en `environment.html`, que antes faltaban), que el enlace activo se marque correctamente, y que el dropdown abra/cierre igual que antes.

- [ ] **Paso 8:** Commit

```bash
git add backend/public/js/dashboard-common.js backend/public/index.html backend/public/battery.html backend/public/solar.html backend/public/environment.html backend/public/inverter.html
git commit -m "refactor: generate nav from a single shared list, fix missing cross-links"
```

---

## Fase B — `updateStatusBadge` compartida

**Archivos:**
- Modificar: `backend/public/js/dashboard-common.js` (agregar la función)
- Modificar: las 5 páginas (borrar su copia local, ajustar las llamadas)

**Interfaces:**
- Consume: nada nuevo (usa los mismos IDs de DOM `status-dot`, `status-text`, `last-seen` que ya existen en las 5 páginas).
- Produce: `updateStatusBadge(createdAt, options)` donde `options.label` es el sustantivo a mostrar (`"Sensor"` u otro).

- [ ] **Paso 1:** Agregar a `backend/public/js/dashboard-common.js`:

```js
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
```

Nota de diseño: esta versión **no** asigna `globalLastReadingTime` (a diferencia de las copias actuales) — esa variable sigue siendo local a cada página, así que cada página la actualiza ella misma justo antes de llamar a la función compartida (ver Paso 3). Así no hay que tocar el `let globalLastReadingTime` de cada página ni su `setInterval` existente.

Y decide la palabra para `label` en `inverter.html`: hoy dice "Sistema" en vez de "Sensor". Si quieres unificar el texto en las 5 páginas usa `'Sensor'` en todas; si prefieres mantener "Sistema" solo para el inversor (tiene sentido semántico distinto — no es un sensor, es todo el sistema del inversor), pásale `{ label: 'Sistema' }` únicamente ahí. Cualquiera de las dos es una decisión de producto válida, no un bug — elige y sé consistente.

- [ ] **Paso 2:** En cada una de las 5 páginas, borrar la función local `function updateStatusBadge(createdAt) { ... }` completa (queda solo la de `dashboard-common.js`).

- [ ] **Paso 3:** En cada página, en los 2-3 lugares donde antes se llamaba `updateStatusBadge(algo)`, agregar la línea que guarda el timestamp justo antes (así se preserva el comportamiento actual de refrescar `globalLastReadingTime`), y pasar el `label` correspondiente. Ejemplo en `index.html` (los tres call-sites: dentro de `fetchReadings`, dentro del handler de socket, y dentro del `setInterval` de salud):

```js
// Antes: updateStatusBadge(latest.created_at);
if (latest.created_at) globalLastReadingTime = latest.created_at;
updateStatusBadge(latest.created_at, { label: 'Sensor' });

// Antes: updateStatusBadge(data.created_at);
if (data.created_at) globalLastReadingTime = data.created_at;
updateStatusBadge(data.created_at, { label: 'Sensor' });

// Antes: updateStatusBadge(globalLastReadingTime);  (dentro del setInterval de salud)
updateStatusBadge(globalLastReadingTime, { label: 'Sensor' });
```

Repite el mismo patrón en `battery.html`, `solar.html`, `environment.html` (todas con `label: 'Sensor'`) e `inverter.html` (con `label: 'Sistema'`, o `'Sensor'` si decidiste unificar en el Paso 1).

- [ ] **Paso 4:** Verificar en cada página que el badge de estado (punto de color + "Sensor Online"/"Demorado"/"Desconectado" + "Visto hace...") se comporta igual que antes: cargar la página, y esperar ~35s sin generar datos nuevos para confirmar que el tiempo relativo sigue avanzando solo (igual que verificamos manualmente para `inverter.html` en la sesión pasada).

- [ ] **Paso 5:** Commit

```bash
git add backend/public/js/dashboard-common.js backend/public/index.html backend/public/battery.html backend/public/solar.html backend/public/environment.html backend/public/inverter.html
git commit -m "refactor: share updateStatusBadge across all dashboards"
```

---

## Fase C — Reducir estilos inline (opcional, prioridad baja)

**Contexto:** no es un bug, es deuda de mantenibilidad. Cada página tiene entre 61 y 114 atributos `style="..."` inline. Hazlo solo si ya terminaste las Fases A y B y quieres seguir invirtiendo en esto — no bloquea nada más de este plan.

**Enfoque sugerido (sin tarea detallada aquí, para no inflar el plan con algo de baja prioridad):** identifica los patrones `style="..."` que se repiten literalmente muchas veces dentro de una misma página (por ejemplo `style="display: flex; align-items: center; gap: 1rem;"` aparece decenas de veces) y conviértelos en clases utilitarias en `style.css` (`.flex-row-gap1`, etc.), reemplazando el atributo por la clase. Hazlo página por página, con un commit por página, verificando visualmente después de cada una.

---

## Autorrevisión

- **Cobertura:** los 3 hallazgos concretos (navegación inconsistente, `environment.html` sin menú móvil, `updateStatusBadge` duplicada con drift) tienen cada uno su tarea con código real.
- **Sin placeholders:** el CSS de la Fase A.1 y el JS de las Fases A.2/B están completos y listos para pegar, verificados contra el código real de `index.html`/`battery.html`/`inverter.html` leído en esta sesión.
- **Consistencia:** `DASHBOARD_PAGES`, `initNav`, `toggleMobileNav` y `updateStatusBadge` son los mismos nombres y firmas en todas las tareas que los usan.
- **Riesgo más alto del plan:** la Tarea A.2, Paso 4 (reemplazar el `nav-mobile` hardcodeado) toca las 5 páginas a la vez — pruébala una página a la vez en vez de las 5 de un tirón, aunque el plan las liste juntas por brevedad.
