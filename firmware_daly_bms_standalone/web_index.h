#ifndef WEB_INDEX_H
#define WEB_INDEX_H

const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE HTML>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daly BMS Monitor | Standalone</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: rgba(30, 41, 59, 0.7);
      --primary: #38bdf8;
      --secondary: #818cf8;
      --accent: #f472b6;
      --success: #4ade80;
      --danger: #f87171;
      --text: #f8fafc;
      --text-dim: #94a3b8;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(129, 140, 248, 0.15) 0px, transparent 50%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }

    .container {
      width: 100%;
      max-width: 900px;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      width: 100%;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 800;
      background: linear-gradient(to right, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .status-badge {
      padding: 0.5rem 1rem;
      border-radius: 99px;
      font-size: 0.8rem;
      font-weight: 600;
      background: var(--card-bg);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--danger);
      box-shadow: 0 0 10px var(--danger);
    }

    .status-dot.online {
      background: var(--success);
      box-shadow: 0 0 10px var(--success);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 1.5rem;
      padding: 1.5rem;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }

    .card-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-dim);
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .card-value {
      font-size: 2.5rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
    }

    .card-unit {
      font-size: 1rem;
      font-weight: 400;
      color: var(--text-dim);
      margin-left: 0.25rem;
    }

    .card-footer {
      font-size: 0.85rem;
      color: var(--text-dim);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 0.75rem;
      margin-top: 0.5rem;
    }

    /* Battery Progress */
    .soc-container {
      position: relative;
      width: 100%;
      height: 12px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 99px;
      overflow: hidden;
      margin: 1rem 0;
    }

    .soc-bar {
      height: 100%;
      background: linear-gradient(to right, var(--primary), var(--secondary));
      border-radius: 99px;
      transition: width 1s ease-in-out;
    }

    /* Controls */
    .controls {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }

    .control-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      background: rgba(255, 255, 255, 0.03);
      padding: 1rem;
      border-radius: 1rem;
      border: 1px solid rgba(255, 255, 255, 0.05);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .control-btn.active {
      background: rgba(56, 189, 248, 0.1);
      border-color: var(--primary);
    }

    .toggle {
      width: 48px;
      height: 24px;
      background: #334155;
      border-radius: 99px;
      position: relative;
      transition: background 0.3s ease;
    }

    .toggle::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      background: white;
      border-radius: 50%;
      transition: transform 0.3s ease;
    }

    .control-btn.active .toggle {
      background: var(--success);
    }

    .control-btn.active .toggle::after {
      transform: translateX(24px);
    }

    .action-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-top: 1rem;
    }

    .btn {
      padding: 0.75rem;
      border-radius: 1rem;
      border: none;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
      text-align: center;
      text-decoration: none;
    }

    .btn-restart {
      background: var(--danger);
      color: white;
    }

    .btn-ota {
      background: var(--primary);
      color: #0f172a;
    }

    .btn:hover {
      opacity: 0.9;
      transform: scale(1.02);
    }

    /* Animations */
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }

    .loading {
      animation: pulse 1.5s infinite;
    }

    @media (max-width: 600px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">DALY BMS Standalone</div>
      <div class="status-badge">
        <div id="status-dot" class="status-dot"></div>
        <span id="status-text">Conectando...</span>
      </div>
    </header>

    <div class="grid">
      <!-- SOC Card -->
      <div class="card">
        <div class="card-title">Carga de Batería</div>
        <div class="card-value"><span id="soc">0</span><span class="card-unit">%</span></div>
        <div class="soc-container">
          <div id="soc-bar" class="soc-bar" style="width: 0%"></div>
        </div>
        <div class="card-footer">
          Voltaje Total: <span id="voltage">0.0</span>V
        </div>
      </div>

      <!-- Current Card -->
      <div class="card">
        <div class="card-title">Corriente y Potencia</div>
        <div class="card-value"><span id="current">0.0</span><span class="card-unit">A</span></div>
        <div class="card-value" style="font-size: 1.5rem; color: var(--primary);">
          <span id="power">0</span><span class="card-unit">W</span>
        </div>
        <div class="card-footer">
          Temperatura: <span id="temp">0.0</span>°C
        </div>
      </div>

      <!-- Cells Card -->
      <div class="card">
        <div class="card-title">Celdas (Min/Max)</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <div>
            <div style="font-size: 0.8rem; color: var(--text-dim);">Max (#<span id="cell-max-num">-</span>)</div>
            <div style="font-size: 1.5rem; font-weight: 700;"><span id="cell-max-v">0.000</span>V</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-dim);">Min (#<span id="cell-min-num">-</span>)</div>
            <div style="font-size: 1.5rem; font-weight: 700;"><span id="cell-min-v">0.000</span>V</div>
          </div>
        </div>
        <div class="card-footer">
          Diferencia: <span id="cell-diff">0.000</span>V
        </div>
      </div>

      <!-- MOSFET Controls -->
      <div class="card">
        <div class="card-title">Estado de MOSFETs</div>
        <div class="controls">
          <div id="btn-charge" class="control-btn" onclick="toggleMos('charge')">
            <span style="font-size: 0.8rem; font-weight: 600;">CARGA</span>
            <div class="toggle"></div>
          </div>
          <div id="btn-discharge" class="control-btn" onclick="toggleMos('discharge')">
            <span style="font-size: 0.8rem; font-weight: 600;">DESCARGA</span>
            <div class="toggle"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- System Actions -->
    <div class="card" style="margin-bottom: 2rem;">
      <div class="card-title">Sistema</div>
      <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-dim);">Hostname</span>
          <span id="sys-host">-.local</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-dim);">Dirección IP</span>
          <span id="sys-ip">0.0.0.0</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-dim);">RSSI (WiFi)</span>
          <span id="sys-rssi">0 dBm</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-dim);">Última Actualización</span>
          <span id="sys-last">-</span>
        </div>
      </div>
      <div class="action-grid">
        <button class="btn btn-restart" onclick="restartSystem()">Reiniciar</button>
        <a href="/update" class="btn btn-ota">Elegant OTA</a>
      </div>
    </div>
  </div>

  <script>
    let lastUpdate = 0;

    function fetchData() {
      fetch('/api/data')
        .then(response => response.json())
        .then(data => {
          document.getElementById('soc').innerText = data.soc.toFixed(1);
          document.getElementById('soc-bar').style.width = data.soc + '%';
          document.getElementById('voltage').innerText = data.voltage.toFixed(2);
          document.getElementById('current').innerText = data.current.toFixed(2);
          document.getElementById('power').innerText = Math.round(data.voltage * data.current);
          document.getElementById('temp').innerText = data.temp1.toFixed(1);
          
          document.getElementById('cell-max-v').innerText = data.cell_max_v.toFixed(3);
          document.getElementById('cell-max-num').innerText = data.cell_max_num;
          document.getElementById('cell-min-v').innerText = data.cell_min_v.toFixed(3);
          document.getElementById('cell-min-num').innerText = data.cell_min_num;
          document.getElementById('cell-diff').innerText = (data.cell_max_v - data.cell_min_v).toFixed(3);

          updateMosBtn('btn-charge', data.charge_mos);
          updateMosBtn('btn-discharge', data.discharge_mos);

          document.getElementById('sys-host').innerText = (data.host || 'dalybms') + '.local';
          document.getElementById('sys-ip').innerText = data.ip || '-';
          document.getElementById('sys-rssi').innerText = (data.rssi || 0) + ' dBm';
          
          const dot = document.getElementById('status-dot');
          const text = document.getElementById('status-text');
          
          if (data.connected) {
            dot.classList.add('online');
            text.innerText = 'Conectado al BMS';
          } else {
            dot.classList.remove('online');
            text.innerText = 'Desconectado del BMS';
          }

          lastUpdate = Date.now();
          document.getElementById('sys-last').innerText = new Date().toLocaleTimeString();
        })
        .catch(err => {
          console.error('Error fetching data:', err);
          document.getElementById('status-dot').classList.remove('online');
          document.getElementById('status-text').innerText = 'Error de Conexión';
        });
    }

    function updateMosBtn(id, state) {
      const btn = document.getElementById(id);
      if (state) btn.classList.add('active');
      else btn.classList.remove('active');
    }

    function toggleMos(type) {
      const btn = document.getElementById('btn-' + type);
      const newState = btn.classList.contains('active') ? 0 : 1;
      
      fetch(`/control?type=${type}&state=${newState}`)
        .then(r => r.json())
        .then(res => {
          if (res.status === 'ok') {
            // Optimistic update
            updateMosBtn('btn-' + type, newState === 1);
          }
        });
    }

    function restartSystem() {
      if (confirm('¿Estás seguro de que quieres reiniciar el ESP32?')) {
        fetch('/restart').then(() => {
          alert('Reiniciando... espera unos segundos.');
        });
      }
    }

    // Polling
    setInterval(fetchData, 2000);
    fetchData();
  </script>
</body>
</html>
)rawliteral";

#endif
