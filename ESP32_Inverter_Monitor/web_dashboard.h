#ifndef WEB_DASHBOARD_H
#define WEB_DASHBOARD_H

const char DASHBOARD_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inverter Lite</title>
    <style>
        :root { --bg: #0a0a0a; --card: #1a1a1a; --border: #333; --green: #0fdb0a; --blue: #007bff; --red: #ff4d4d; --text: #eee; }
        body { font-family: -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 15px; }
        header { border-bottom: 1px solid var(--border); padding-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 20px; }
        .card { background: var(--card); border: 1px solid var(--border); padding: 15px; border-radius: 8px; }
        .c-title { font-size: 0.8rem; color: #888; text-transform: uppercase; }
        .c-val { font-size: 1.5rem; font-weight: bold; margin: 5px 0; color: #fff; }
        .unit { font-size: 0.8rem; opacity: 0.6; }
        .badge { font-size: 0.7rem; padding: 3px 8px; border-radius: 10px; border: 1px solid #444; }
        .log-box { width: 100%; height: 200px; background: #000; color: var(--green); font-family: monospace; font-size: 0.8rem; padding: 10px; border-radius: 8px; overflow-y: scroll; margin-top: 10px; }
        .btn { display: inline-block; padding: 8px 15px; background: var(--blue); color: #fff; text-decoration: none; border-radius: 5px; font-size: 0.8rem; margin: 2px; }
        .btn-restart { background: var(--red); color: #fff; border: none; cursor: pointer; }
        .p-bar { height: 5px; background: #333; border-radius: 3px; overflow: hidden; margin-top: 10px; }
        .p-fill { height: 100%; background: var(--blue); transition: 0.3s; }
    </style>
</head>
<body>
    <header>
        <div>
            <b style="font-size: 1.2rem;">POWMR LITE</b><br>
            <span id="sync-t" class="unit">Sincronizando...</span>
        </div>
        <div id="stat" class="badge">--</div>
    </header>

    <div class="grid">
        <div class="card" style="border-top: 3px solid orange;">
            <div class="c-title">SOLAR (PV)</div>
            <div class="c-val"><span id="pv-w">0</span><span class="unit">W</span></div>
            <div class="unit"><span id="pv-v">0</span>V | <span id="pv-c">0</span>A</div>
        </div>
        <div class="card" style="border-top: 3px solid var(--green);">
            <div class="c-title">BATERIA (<span id="b-cap">0</span>%)</div>
            <div class="c-val"><span id="b-v">0.00</span><span class="unit">V</span></div>
            <div class="unit">Flujo: <b id="b-w">0</b>W</div>
            <div class="unit">Carga: <span id="b-c" style="color:var(--green)">0</span>A | Desc: <span id="b-d" style="color:var(--red)">0</span>A</div>
            <div class="p-bar"><div id="b-fill" class="p-fill" style="background:var(--green)"></div></div>
        </div>
        <div class="card" style="border-top: 3px solid var(--red);">
            <div class="c-title">CARGA (<span id="l-p">0</span>%)</div>
            <div class="c-val"><span id="o-w">0</span><span class="unit">W</span></div>
            <div class="unit">Inverter: <span id="o-v">0</span>V | Red: <span id="a-v">0</span>V</div>
            <div class="p-bar"><div id="l-fill" class="p-fill" style="background:var(--red)"></div></div>
        </div>
    </div>

    <div style="margin-top: 20px;">
        <div class="c-title">DIAGNOSTICO</div>
        <div id="log" class="log-box">Esperando datos...</div>
        <a href="/update" class="btn">Actualizar (OTA)</a>
        <a href="/api/data" target="_blank" class="btn" style="background:#444">Datos API</a>
        <button onclick="rst()" class="btn btn-restart">Reiniciar ESP32</button>
    </div>

    <script>
        function up() {
            fetch('/api/data').then(r=>r.json()).then(d=>{
                document.getElementById('pv-w').innerText = d.pv_w;
                document.getElementById('pv-v').innerText = (d.pv_v||0).toFixed(1);
                document.getElementById('pv-c').innerText = d.pv_c;
                document.getElementById('b-v').innerText = (d.batt_v||0).toFixed(2);
                document.getElementById('b-cap').innerText = d.batt_cap;
                document.getElementById('b-c').innerText = d.batt_c;
                document.getElementById('b-d').innerText = d.batt_d;
                document.getElementById('b-w').innerText = d.batt_w;
                document.getElementById('b-w').style.color = (d.batt_w >= 0) ? 'var(--green)' : 'var(--red)';
                document.getElementById('b-fill').style.width = d.batt_cap+'%';
                document.getElementById('o-w').innerText = d.out_w;
                document.getElementById('l-p').innerText = d.load_p;
                document.getElementById('o-v').innerText = (d.out_v||0).toFixed(0);
                document.getElementById('a-v').innerText = (d.ac_v||0).toFixed(0);
                document.getElementById('l-fill').style.width = d.load_p+'%';
                document.getElementById('sync-t').innerText = 'Ult. sincronía: hace '+d.last_sync+'s';
                const s = document.getElementById('stat');
                s.innerText = 'ONLINE'; s.style.color = 'var(--green)'; s.style.borderColor = 'var(--green)';
            }).catch(e=>{
                document.getElementById('stat').innerText = 'ERROR';
                document.getElementById('stat').style.color = 'var(--red)';
            });

            fetch('/api/log').then(r=>r.text()).then(t=>{
                const l = document.getElementById('log');
                l.innerText = t; l.scrollTop = l.scrollHeight;
            });
        }
        function rst() {
            if(confirm('¿Reiniciar ESP32?')){
                fetch('/api/restart').then(()=>alert('Reiniciando...')).catch(()=>alert('Comando enviado'));
            }
        }
        setInterval(up, 5000); up();
    </script>
</body>
</html>
)rawliteral";

#endif
