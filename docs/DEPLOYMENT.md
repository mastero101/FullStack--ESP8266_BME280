# Despliegue y Seguridad

## Ejecutar en producción

Se recomienda **PM2** para mantener el backend siempre activo y con reinicio automático:

```bash
cd backend
npm install -g pm2
pm2 start index.js --name "iot-dashboard"
pm2 save
pm2 startup
```

## CI/CD (GitHub Actions)

El repositorio incluye [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), que en cada `push` a `main`:

1. **`validate`** (corre en un runner de GitHub, `ubuntu-latest`): instala dependencias del backend (`npm ci`) y verifica que `index.js`/`db.js` no tengan errores de sintaxis (`node --check`). `package.json` no define tests reales todavía — su script `test` es un stub que siempre falla (`exit 1`), así que el workflow **no** lo ejecuta a propósito. Si en el futuro agregas tests de verdad, reemplaza el paso de sintaxis por `npm test`.
2. **`deploy`** (corre solo si `validate` pasa, en un **runner self-hosted** instalado en `masteroserver`): hace `git pull origin main` sobre el clon ya existente en `/home/mastero/FullStack- ESP8266_BME280`, reinstala dependencias de producción (`npm install --omit=dev`) y reinicia el proceso con `pm2 restart bme280-station --update-env`.

### Por qué un runner self-hosted y no SSH desde GitHub

El job de deploy corre *dentro* de `masteroserver`, no se conecta a él desde fuera. Esto evita tener que abrir el puerto SSH del servidor a Internet o subir una llave privada como Secret de GitHub — el runner es el que llama hacia GitHub para pedir trabajo (igual que hace `cloudflared`, en dirección saliente).

### Configurar el runner self-hosted en `masteroserver`

Esto lo debes ejecutar tú por SSH en el servidor — no tengo acceso a `masteroserver`.

> ⚠️ **`masteroserver` ya tiene un runner de otro proyecto** (`~/actions-runner`, usado por `ecommerce_CI-CD`). Un runner self-hosted se registra contra un repositorio (o una organización) específico en `config.sh --url`, así que **no** reutilices esa carpeta: un job de este repo nunca llegaría al runner de otro repo de todas formas, pero mezclar dos registros en la misma carpeta rompe ambos. Crea una carpeta e instancia de servicio **nuevas y separadas** solo para este proyecto.

1. En GitHub, dentro de **este** repositorio: **Settings → Actions → Runners → New self-hosted runner** (elige Linux/x64). GitHub te dará un token de registro temporal y los comandos exactos; usa una carpeta con nombre distinto a la existente:
   ```bash
   mkdir -p ~/actions-runner-bme280 && cd ~/actions-runner-bme280
   curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/download/<version>/actions-runner-linux-x64-<version>.tar.gz
   tar xzf actions-runner.tar.gz
   ./config.sh --url https://github.com/mastero101/<nombre-de-este-repo> --token <TOKEN_QUE_TE_DA_GITHUB> --name bme280-runner
   ```

   > **Ejecutando como root en `masteroserver`**: `config.sh` rechaza correr como root por defecto (`Must not run with sudo`). Aquí es intencional mantenerlo como root: el proceso `bme280-station` está registrado en el daemon de PM2 **de root** (`/root/.pm2/logs/bme280-station-*.log`), y PM2 usa un daemon distinto por usuario del sistema — si el runner corriera como otro usuario (p.ej. `mastero`), `pm2 restart bme280-station` no vería ese proceso. Usa la variable de escape del runner:
   > ```bash
   > RUNNER_ALLOW_RUNASROOT="1" ./config.sh --url https://github.com/mastero101/<nombre-de-este-repo> --token <TOKEN_QUE_TE_DA_GITHUB> --name bme280-runner
   > ```
   > Si en el futuro este repo suma colaboradores con permiso de `push` a `main`, migra `bme280-station` al usuario `mastero` (parar el proceso bajo root, reiniciarlo con `pm2` como `mastero`, `pm2 save`) y corre el runner sin root — cualquier workflow que se dispare aquí corre con los privilegios del usuario del runner sobre todo el servidor.
2. Instálalo como servicio (el nombre del servicio systemd se genera automáticamente a partir del repo, así que no chocará con el del otro proyecto). Repite la misma variable de entorno si instalaste el runner como root:
   ```bash
   unset SUDO_USER   # evita que svc.sh instale el servicio para tu usuario original en vez de root
   RUNNER_ALLOW_RUNASROOT="1" ./svc.sh install
   RUNNER_ALLOW_RUNASROOT="1" ./svc.sh start
   ```
   > Si llegaste a una sesión root vía `sudo -i`/`sudo su`, la variable de entorno `SUDO_USER` sigue apuntando a tu usuario original (p.ej. `mastero`). `svc.sh` la usa para decidir bajo qué usuario correr el servicio, así que sin el `unset` puede terminar generando `User=mastero` en el `.service` aunque hayas forzado `RUNNER_ALLOW_RUNASROOT`. Eso falla con `status=200/CHDIR` porque `mastero` no puede entrar a `/root/actions-runner-bme280`. Si ya te pasó, corrígelo sin reinstalar:
   > ```bash
   > sudo systemctl stop actions.runner.<org>-<repo>.<runner-name>.service
   > sudo sed -i 's/^User=.*/User=root/; s/^Group=.*/Group=root/' /etc/systemd/system/actions.runner.<org>-<repo>.<runner-name>.service
   > sudo systemctl daemon-reload
   > sudo systemctl start actions.runner.<org>-<repo>.<runner-name>.service
   > ```
3. Confirma que ambos servicios coexisten sin pisarse:
   ```bash
   sudo systemctl list-units --type=service | grep actions.runner
   ```
   Deberías ver dos unidades distintas, una por repositorio.
4. Verifica en GitHub (**Settings → Actions → Runners** de este repo) que aparezca como "Idle"/en línea.

> ⚠️ **Importante**: el workflow dispara `deploy` con cualquier `push` a `main`, sin distinguir quién lo hizo. Si este repositorio llegara a ser público con colaboradores externos, un self-hosted runner puede ejecutar código arbitrario en tu servidor doméstico a través de un PR malicioso. Mientras seas el único con permiso de push a `main`, es seguro; si agregas colaboradores, restringe el workflow a que el deploy solo corra tras aprobación manual (`environment` con *required reviewers*) o vuelve al esquema de runners de GitHub + SSH.

### Suposiciones del workflow (verifica que apliquen)

- La rama por defecto se llama `main` y el remoto configurado en el servidor es `origin`.
- El proceso PM2 se llama exactamente `bme280-station` (confirmado con `pm2 status`) y ya existe — el workflow solo lo reinicia, no lo crea desde cero.
- **El directorio de producción es un clon git real** (`git status` funciona ahí, con `origin` apuntando al repo de GitHub) y el `git pull` puede hacerse *fast-forward* (sin cambios locales sin commitear en archivos versionados). Si el pull falla por conflictos, el job fallará de forma visible en vez de sobreescribir cambios en silencio.

#### Preparación única: convertir el directorio existente en un clon git

Si el directorio de producción se desplegó originalmente a mano (p.ej. por `scp`, como sugería el README anterior del backend) en vez de con `git clone`, el primer `git pull` del workflow falla con `fatal: not a git repository`. Se soluciona una sola vez, por SSH:

```bash
cd "/home/mastero/FullStack- ESP8266_BME280"
git status   # confirma el error "not a git repository"

# Backup completo por seguridad — reset --hard va a sobreescribir cualquier
# archivo trackeado que difiera del repo de GitHub.
cp -a "/home/mastero/FullStack- ESP8266_BME280" "/home/mastero/FullStack- ESP8266_BME280.bak-$(date +%Y%m%d)"

git init -b main
git remote add origin https://github.com/mastero101/<nombre-de-este-repo>.git
git fetch origin main
git reset --hard origin/main

git status   # debe quedar "working tree clean" en main
```

`backend/.env` y todo `*/config.h` nunca estuvieron trackeados en git, así que `reset --hard` no los toca — pero cualquier otro archivo con cambios manuales no commiteados sí se pierde (por eso el backup previo). Carpetas sueltas sin relación con el repo (ver nota sobre `firmware`/`firmware_ina226_solar` más abajo) tampoco se tocan, quedan como cruft sin trackear.

Como el directorio pertenece al usuario `mastero` pero el runner corre como `root`, git bloqueará cualquier operación ahí con `fatal: detected dubious ownership in repository` hasta que se agregue una excepción **en la configuración global de root** (no en la de `mastero`, aunque tu prompt diga `root@masteroserver` — el mismo problema de `$HOME` heredado que ya vimos con `svc.sh`):

```bash
HOME=/root git config --global --add safe.directory "/home/mastero/FullStack- ESP8266_BME280"
cat /root/.gitconfig   # confirma que la excepción quedó en /root/.gitconfig, no en el de mastero
```

## Acceso remoto sin abrir puertos

Si el backend corre en tu red local y quieres acceder desde fuera sin exponer puertos ni contratar un dominio, usa un [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
cloudflared tunnel --url http://127.0.0.1:7755
```

Esto genera un enlace temporal `*.trycloudflare.com` que reenvía tráfico al backend local. Para un uso más permanente, considera un túnel nombrado con tu propio dominio en Cloudflare.

## Seguridad de credenciales

El proyecto está sanitizado para control de versiones: `backend/.env` y todo archivo `*/config.h` están excluidos vía `.gitignore`, junto con `build/`, binarios (`*.bin`, `*.elf`, `*.hex`) y archivos comprimidos (`*.7z`, `*.zip`, `*.rar`, `*.tar.gz`).

Para levantar el entorno tras un `git clone`:
1. Copia cada `config.h.example` → `config.h` (por firmware) y `backend/.env.example` → `backend/.env`.
2. Rellena tus credenciales reales (WiFi, base de datos, `BMS_PIN`).
3. Nunca subas estos archivos ya completados al repositorio.

<a name="seguridad"></a>
## Notas de seguridad adicionales (detectadas en revisión)

- **OTA sin autenticación**: `firmware_daly_bms_ble` y `firmware_daly_bms_standalone` inicializan `ElegantOTA.begin(&server)` **sin** usuario/contraseña. Cualquier dispositivo en la misma red WiFi puede acceder a `/update` y reflashear el ESP32. `ESP32_Inverter_Monitor` sí protege el suyo con `OTA_USER`/`OTA_PASS` (definidos en `config.h`, cámbialos del valor por defecto `admin`/`admin123` antes de desplegar). Si es posible, añade las mismas credenciales a los firmwares de BMS o aíslalos en una VLAN/red de confianza.
- **`BMS_PIN` por defecto**: si no defines `BMS_PIN` en `backend/.env`, el backend usa `"000000"` como PIN de control del BMS (`GET /api/config/bms-pin`). Defínelo siempre en producción.
- **CORS abierto**: tanto Express (`cors()`) como Socket.io (`cors: { origin: "*" }`) aceptan peticiones de cualquier origen. Aceptable para uso doméstico/LAN, pero restringe el `origin` si expones el backend directamente a Internet.
- **Túnel público = dashboard público**: si usas Cloudflare Tunnel (o similar) sin autenticación adicional delante del backend, cualquiera con el enlace `.trycloudflare.com` puede leer tus lecturas y, si conoce el `BMS_PIN`, controlar el BMS. Considera añadir Cloudflare Access u otra capa de autenticación si el túnel deja de ser temporal.
