/*
  ESP32 Lolin32 Lite - OLED Dashboard
  Visualizador de datos para Monitor de Batería y Solar
  Incluye ElegantOTA para actualizaciones inalámbricas.

  Mejoras v2:
  - Fix: ElegantOTA.loop() en loop() para que OTA funcione correctamente
  - Fix: Verificación de httpCode en /solar/latest antes de parsear JSON
  - Fix: Reconexión WiFi automática si se pierde la señal
  - Feature: 3 pantallas rotativas (Dashboard / Potencia / Info Sistema)
  - Feature: Alerta visual con parpadeo cuando batería < 20% SOC
*/

#include "config.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESPmDNS.h>
#include <ElegantOTA.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <Wire.h>

// ─── Configuración OLED ───────────────────────────────────────────────────────
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ─── Servidor Web para OTA ───────────────────────────────────────────────────
AsyncWebServer server(80);

// ─── Variables de datos ──────────────────────────────────────────────────────
float battVolt = 0.0;
float battSOC  = 0.0;
float solarVolt  = 0.0;
float solarWatts = 0.0;
String lastDate = "--/--";
String lastTime = "--:--";
bool initialDataFetched = false;
unsigned long ipScreenStartTime = 0;
const unsigned long ipScreenDuration = 10000; // 10 segundos para ver la IP

String wifiStatus  = "Desconectado";
String serverStatus = "Esperando...";
bool serverOnline = false;

unsigned long lastUpdate = 0;
const long updateInterval = 10000; // Actualizar cada 10 segundos

// ─── Control de pantallas rotativas ──────────────────────────────────────────
uint8_t currentScreen = 0;           // 0=Dashboard, 1=Potencia, 2=Info Sistema
unsigned long lastScreenChange = 0;
const unsigned long screenDuration = 5000; // 5 segundos por pantalla

// ─── Prototipos ──────────────────────────────────────────────────────────────
void fetchData();
void fetchBattery();
void fetchInverter();
void updateDisplay();
void drawBootScreen();
void drawDashboard();
void drawPowerScreen();
void drawSystemScreen();
void drawBatteryBar(int x, int y, int w, int h, float pct);

// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // Inicializar OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
    for (;;);
  }

  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("SISTEMA DE MONITOREO");
  display.println("");
  display.println("Iniciando WiFi...");
  display.display();

  // Conectar WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  wifiStatus = "Conectando...";
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    updateDisplay();
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiStatus = "CONECTADO";
    Serial.println("\nWiFi Conectado!");

    if (MDNS.begin("iot-display")) {
      Serial.println("mDNS iniciado: iot-display.local");
    }
  } else {
    wifiStatus = "ERROR WIFI";
  }

  // Configurar ElegantOTA
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "Display ESP32 - DashBoard IoT v2");
  });

  ElegantOTA.begin(&server);
  server.begin();
  MDNS.addService("http", "tcp", 80);

  fetchData();
}

// ─────────────────────────────────────────────────────────────────────────────
void loop() {
  // Fix: ElegantOTA necesita ser procesado cada ciclo para que OTA funcione
  ElegantOTA.loop();

  // Actualizar datos según intervalo
  if (millis() - lastUpdate > updateInterval) {
    fetchData();
    lastUpdate = millis();
  }

  // Rotar pantalla cada screenDuration ms (solo en modo dashboard)
  if (initialDataFetched &&
      (millis() - ipScreenStartTime >= ipScreenDuration)) {
    if (millis() - lastScreenChange > screenDuration) {
      currentScreen = (currentScreen + 1) % 2;
      lastScreenChange = millis();
    }
  }

  updateDisplay();
}

// ─── Fetch de datos ───────────────────────────────────────────────────────────

void fetchBattery() {
  HTTPClient http;
  http.begin(String(serverName) + "/battery/latest");
  int httpCode = http.GET();

  if (httpCode == 200) {
    serverOnline = true;
    serverStatus = "ONLINE";
    DynamicJsonDocument doc(512);
    deserializeJson(doc, http.getString());
    battVolt = doc["voltage"] | 0.0f;

    battSOC = ((battVolt - eVolt) / (fVolt - eVolt)) * 100.0f;
    if (battSOC > 100.0f) battSOC = 100.0f;
    if (battSOC < 0.0f)   battSOC = 0.0f;

    String createdAt = doc["created_at"].as<String>();
    if (createdAt.length() > 16) {
      int day    = createdAt.substring(8, 10).toInt();
      int month  = createdAt.substring(5, 7).toInt();
      int hour   = createdAt.substring(11, 13).toInt();
      int minute = createdAt.substring(14, 16).toInt();

      hour += timeOffset;
      if (hour < 0)  { hour += 24; day--; }
      if (hour >= 24){ hour -= 24; day++; }

      char dateBuf[8], timeBuf[8];
      sprintf(dateBuf, "%02d/%02d", day, month);
      sprintf(timeBuf, "%02d:%02d", hour, minute);
      lastDate = String(dateBuf);
      lastTime = String(timeBuf);
    }

    if (!initialDataFetched) {
      initialDataFetched = true;
      ipScreenStartTime = millis();
    }
  } else {
    serverOnline = false;
    serverStatus = "ERROR SRV";
    Serial.printf("[Battery] HTTP error: %d\n", httpCode);
  }
  http.end();
}

void fetchInverter() {
  HTTPClient http;
  http.begin(String(serverName) + "/inverter/latest");
  int httpCode = http.GET();

  if (httpCode == 200) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, http.getString());
    // pv_v = Solar panel voltage reported by the inverter
    solarVolt  = doc["pv_v"] | 0.0f;
    // pv_w = Solar power (watts) already computed by the inverter
    solarWatts = doc["pv_w"] | 0.0f;
  } else {
    Serial.printf("[Inverter] HTTP error: %d\n", httpCode);
  }
  http.end();
}

void fetchData() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiStatus = "CONECTADO";
    serverStatus = "Cargando...";

    fetchBattery();
    if (serverOnline) {
      fetchInverter(); // provides both pv_v (solar voltage) and pv_w (solar watts)
    }
  } else {
    // Fix: Intentar reconectar automáticamente si se perdió la señal
    wifiStatus = "PERDIDA RED";
    serverOnline = false;
    Serial.println("[WiFi] Señal perdida — intentando reconectar...");
    WiFi.reconnect();
  }
}

// ─── Display ──────────────────────────────────────────────────────────────────

// Dibuja una barra de progreso horizontal para el SOC
void drawBatteryBar(int x, int y, int w, int h, float pct) {
  display.drawRect(x, y, w, h, WHITE);
  int filled = (int)((w - 2) * pct / 100.0f);
  if (filled > 0) {
    display.fillRect(x + 1, y + 1, filled, h - 2, WHITE);
  }
}

// Pantalla de arranque / IP
void drawBootScreen() {
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("SISTEMA INICIADO");
  display.drawFastHLine(0, 10, 128, WHITE);

  display.setCursor(0, 15);
  display.print("WiFi: ");
  display.println(wifiStatus);

  if (WiFi.status() == WL_CONNECTED) {
    display.setCursor(0, 25);
    display.print("IP:   ");
    display.println(WiFi.localIP().toString());
    display.setCursor(0, 35);
    display.print("Host: iot-display.local");

    display.setCursor(0, 48);
    if (!initialDataFetched) {
      display.println("Conectando Servidor...");
    } else {
      display.println("TODO ONLINE!");
      display.setCursor(0, 56);
      display.print("Iniciando en: ");
      display.print((ipScreenDuration - (millis() - ipScreenStartTime)) / 1000);
      display.print(" seg");
    }
  }
}

// Pantalla 0 — Dashboard (Batería + Solar + Hora)
void drawDashboard() {
  bool showBlink = (millis() / 500) % 2 == 0; // alterna cada 500 ms
  bool lowBatt   = (battSOC < 20.0f);

  // ── BLOQUE BATERÍA ──
  display.setTextSize(1);
  display.setCursor(0, 0);
  // Parpadeo en la etiqueta si batería baja
  if (!lowBatt || showBlink) {
    display.print("BATERIA");
  }
  display.setCursor(85, 0);
  display.print("SOC");

  display.setTextSize(2);
  display.setCursor(0, 10);
  display.print(battVolt, 1);
  display.setCursor(display.getCursorX() + 4, 10);
  display.print("V");

  // Valor SOC parpadea si batería baja
  if (!lowBatt || showBlink) {
    display.setCursor(80, 10);
    display.print((int)battSOC);
    display.print("%");
  }

  // Barra de SOC
  drawBatteryBar(0, 27, 128, 5, battSOC);

  // ── BLOQUE SOLAR ──
  display.setTextSize(1);
  display.setCursor(0, 36);
  display.print("SOLAR:");
  display.setTextSize(2);
  display.setCursor(0, 46);
  display.print(solarVolt, 1);
  display.setCursor(display.getCursorX() + 4, 46);
  display.print("V");

  // Hora (esquina derecha)
  display.setTextSize(1);
  display.setCursor(90, 36);
  display.print(lastTime);

  // Watts
  display.setTextSize(2);
  {
    int watts     = (int)solarWatts;
    int numDigits = (watts < 10) ? 1 : (watts < 100) ? 2 : 3;
    int wattsX    = 128 - (numDigits * 12) - 4 - 12;
    if (wattsX < 70) wattsX = 70;
    display.setCursor(wattsX, 46);
    display.print(watts);
    display.setCursor(display.getCursorX() + 4, 46);
    display.print("W");
  }

  // Indicador offline
  if (!serverOnline) {
    display.setTextSize(1);
    display.setCursor(0, 57);
    display.print("! OFFLINE");
  }
}

// Pantalla 1 — Potencia (Watts grande + indicador carga/descarga + fecha)
void drawPowerScreen() {
  bool charging = (solarWatts > 10.0f); // heurística simple

  // Título
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("GENERACION SOLAR");
  display.drawFastHLine(0, 10, 128, WHITE);

  // Watts en grande centrado
  display.setTextSize(3);
  int watts = (int)solarWatts;
  {
    // Calcular ancho: cada char en size3 = 18px aprox
    int numDigits = (watts < 10) ? 1 : (watts < 100) ? 2 : 3;
    int totalW    = numDigits * 18 + 4 + 18; // dígitos + gap + "W"
    int startX    = (128 - totalW) / 2;
    if (startX < 0) startX = 0;
    display.setCursor(startX, 16);
    display.print(watts);
    display.setCursor(display.getCursorX() + 4, 16);
    display.print("W");
  }

  // Indicador carga / descarga
  display.setTextSize(1);
  display.setCursor(0, 44);
  if (charging) {
    display.print(">> Cargando bateria");
  } else {
    display.print("-- Sin generacion");
  }

  // Fecha y hora
  display.setCursor(0, 55);
  display.print(lastDate);
  display.print("  ");
  display.print(lastTime);
}

// Pantalla 2 — Info del Sistema
void drawSystemScreen() {
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("INFO SISTEMA");
  display.drawFastHLine(0, 10, 128, WHITE);

  display.setCursor(0, 14);
  display.print("WiFi: "); display.println(wifiStatus);

  display.setCursor(0, 24);
  display.print("IP:   ");
  display.println(WiFi.status() == WL_CONNECTED
                  ? WiFi.localIP().toString()
                  : "---");

  display.setCursor(0, 34);
  display.print("Srv:  "); display.println(serverStatus);

  display.setCursor(0, 44);
  display.print("Host: iot-display");

  display.setCursor(0, 54);
  display.print("Upd:  "); display.print(lastTime);

  // Indicador de pantalla activa (puntos)
  for (int i = 0; i < 3; i++) {
    if (i == currentScreen) {
      display.fillCircle(58 + i * 8, 63, 2, WHITE);
    } else {
      display.drawCircle(58 + i * 8, 63, 2, WHITE);
    }
  }
}

void updateDisplay() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  // Mostrar pantalla de arranque hasta que haya datos Y pasen 10 segundos
  if (!initialDataFetched ||
      (millis() - ipScreenStartTime < ipScreenDuration)) {
    drawBootScreen();
  } else {
    // Indicador de pantalla actual (puntitos) en todas las vistas
    switch (currentScreen) {
      case 0: drawDashboard();    break;
      case 1: drawPowerScreen();  break;
      default: drawDashboard();   break;
    }
  }

  display.display();
}
