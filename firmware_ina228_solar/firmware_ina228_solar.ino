/*
  IoT Project - ESP8266 + INA228
  Solar Panel Monitor
  
  Migrado de INA226 → INA228
  - ADC 20-bit (mayor precisión)
  - Rango hasta 85V (vs 36V del INA226)
  - Sensor de temperatura integrado
  - Registros de energía y carga acumulada
  
  Librería: Rob Tillaart INA228
  https://github.com/RobTillaart/INA228
*/

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#include <INA228.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <ArduinoJson.h>
#include <ESP8266mDNS.h>
#include <ESPAsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ElegantOTA.h>
#include <ESP8266WiFiMulti.h>
#include <FS.h>
#include <LittleFS.h>

#include "config.h"

// NTP Client
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", -21600); 

// INA228 sensor (Rob Tillaart Library)
INA228 ina228(0x40);
float busVoltage_V = 0.0;
float current_mA = 0.0;
float power_mW = 0.0;
float temperature_C = 0.0;   // Nuevo: temperatura interna del INA228

// Servidor para OTA y DNS
AsyncWebServer server(80);
ESP8266WiFiMulti wifiMulti;
bool apMode = false;

// Config persistente
String customSSID = "";
String customPASS = "";
String wifiStatus = "Desconectado";
String serverStatus = "Esperando...";

void loadConfig() {
  if (LittleFS.begin()) {
    if (LittleFS.exists("/wifi.json")) {
      File f = LittleFS.open("/wifi.json", "r");
      StaticJsonDocument<256> doc;
      deserializeJson(doc, f);
      customSSID = doc["ssid"] | "";
      customPASS = doc["pass"] | "";
      f.close();
      if (customSSID.length() > 0) {
        wifiMulti.addAP(customSSID.c_str(), customPASS.c_str());
        Serial.printf("Cargada red personalizada: %s\n", customSSID.c_str());
      }
    }
  }
}

// State Control
enum AppState { INIT, SYNC_CHECK, MONITORING };
AppState currentAppState = INIT;
unsigned long stateStartTime = 0;
bool isServerOnline = false;

// Timers
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 60000; // 60 segundos (1 min)

// --- Logic ---

void readINA228() {
  // INA228 retorna: Voltaje en V, Corriente en A, Potencia en W
  busVoltage_V = ina228.getBusVoltage();       // Volts
  float current_A = ina228.getCurrent();       // Amperes
  float power_W = ina228.getPower();           // Watts
  temperature_C = ina228.getTemperature();     // °C (sensor interno)
  
  // Convertir a mA y mW para mantener compatibilidad con el backend
  current_mA = current_A * 1000.0;
  power_mW = power_W * 1000.0;
}

void trySync() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    
    Serial.print("Probando conexion a: ");
    Serial.println(serverName);

    String endpoint = String(serverName) + "/solar"; 
    http.begin(client, endpoint);
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<256> doc;
    doc["voltage"] = busVoltage_V;
    doc["current"] = current_mA;
    doc["power"] = power_mW;
    doc["temperature"] = temperature_C;
    doc["timestamp"] = timeClient.getEpochTime();

    String jsonPayload;
    serializeJson(doc, jsonPayload);
    
    int httpResponseCode = http.POST(jsonPayload);
    
    Serial.print("Resultado Sync: ");
    Serial.println(httpResponseCode);
    
    if (httpResponseCode <= 0) {
      Serial.print("Error especifico: ");
      Serial.println(http.errorToString(httpResponseCode).c_str());
    }

    isServerOnline = (httpResponseCode == 201 || httpResponseCode == 200);
    http.end();
  } else {
    Serial.println("No se puede sincronizar: WiFi desconectado");
  }
}

void setup() {
  Serial.begin(115200);

  Serial.println("\n========================================");
  Serial.println("  MasterOS Solar Panel Firmware v2.0");
  Serial.println("  Sensor: INA228 (20-bit, 85V)");
  Serial.println("========================================");
  
  // Invertir pines I2C: SDA=D1 (GPIO5), SCL=D2 (GPIO4)
  Wire.begin(D1, D2);
  
  // Inicializar INA228
  if (!ina228.begin()) {
    while (1) {
       Serial.println("INA228 ERROR: Sensor no encontrado. Revisa cableado.");
       Serial.println("  - Verifica SDA (D1) y SCL (D2)");
       Serial.println("  - Verifica direccion I2C (0x40)");
       delay(3000);
    }
  }
  Serial.println("INA228 detectado correctamente.");
  
  // Calibración OBLIGATORIA para lecturas correctas de corriente y potencia
  int calResult = ina228.setMaxCurrentShunt(maxCurrent, shuntResistor);
  if (calResult != 0) {
    Serial.print("ADVERTENCIA: Error en calibracion INA228, codigo: ");
    Serial.println(calResult);
    Serial.println("  Las lecturas de corriente/potencia pueden ser incorrectas.");
  } else {
    Serial.printf("INA228 calibrado: MaxI=%.1fA, Rshunt=%.4f Ohms\n", maxCurrent, shuntResistor);
  }

  WiFi.mode(WIFI_STA);
  
  loadConfig(); // Intentar cargar red guardada en memoria flash

  // Añadir todas las redes configuradas en config.h
  for (int i = 0; i < networkCount; i++) {
    wifiMulti.addAP(networks[i].ssid, networks[i].password);
    Serial.printf("Añadida red WiFi: %s\n", networks[i].ssid);
  }

  Serial.println("Buscando red WiFi...");
  
  // Intentar conectar durante 10 segundos
  unsigned long startAttemptTime = millis();
  while (wifiMulti.run() != WL_CONNECTED && millis() - startAttemptTime < 10000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiStatus = "CONECTADO";
    Serial.printf("\nWiFi Conectado a: %s | IP: %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  } else {
    wifiStatus = "MODO AP";
    apMode = true;
    WiFi.mode(WIFI_AP_STA); // Modo dual para permitir escaneo
    WiFi.softAP("SOLAR-MONITOR-SETUP");
    Serial.println("\nNo se encontro red. Iniciando punto de acceso: SOLAR-MONITOR-SETUP");
  }

  // Rutas del Servidor de Configuración
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    String html = "<html><head><meta charset='UTF-8'><style>";
    html += "body { font-family: sans-serif; margin: 20px; background: #f4f4f4; }";
    html += ".card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }";
    html += "h1 { color: #2c3e50; } .val { font-size: 1.2em; font-weight: bold; color: #27ae60; }";
    html += ".chip { display: inline-block; padding: 3px 8px; border-radius: 5px; font-size: 0.8em; background: #3498db; color: white; }";
    html += "</style></head><body>";
    html += "<div class='card'><h1>☀ Monitor Solar <span class='chip'>INA228</span></h1>";
    html += "<p><b>WiFi:</b> " + wifiStatus + " (" + WiFi.SSID() + ")</p>";
    html += "<p><b>Servidor:</b> " + serverStatus + "</p>";
    html += "<hr>";
    html += "<h3>Última Lectura:</h3>";
    html += "<p>Voltaje: <span class='val'>" + String(busVoltage_V, 3) + " V</span></p>";
    html += "<p>Corriente: <span class='val'>" + String(current_mA, 2) + " mA</span></p>";
    html += "<p>Potencia: <span class='val'>" + String(power_mW, 2) + " mW</span></p>";
    html += "<p>Temperatura: <span class='val'>" + String(temperature_C, 1) + " °C</span></p>";
    html += "<hr>";
    html += "<p><a href='/config'>⚙ Configurar WiFi</a></p>";
    html += "<p><a href='/update'>🚀 Actualizar Firmware (OTA)</a></p>";
    html += "</div></body></html>";
    request->send(200, "text/html", html);
  });

  server.on("/config", HTTP_GET, [](AsyncWebServerRequest *request) {
    String html = "<h2>Configurar WiFi</h2><form action='/save' method='POST'>";
    html += "SSID: <br><input type='text' name='ssid' placeholder='Nombre de red'><br>";
    html += "Password: <br><input type='password' name='pass'><br><br>";
    html += "<input type='submit' value='Guardar y Reiniciar'></form>";
    request->send(200, "text/html", html);
  });

  server.on("/save", HTTP_POST, [](AsyncWebServerRequest *request) {
    String s = request->arg("ssid");
    String p = request->arg("pass");
    
    if (s.length() > 0) {
      File f = LittleFS.open("/wifi.json", "w");
      StaticJsonDocument<256> doc;
      doc["ssid"] = s;
      doc["pass"] = p;
      serializeJson(doc, f);
      f.close();
      request->send(200, "text/html", "Configuracion guardada. Reiniciando...");
      delay(2000);
      ESP.restart();
    } else {
      request->send(400, "text/plain", "SSID invalido");
    }
  });

  ElegantOTA.begin(&server);
  server.begin();
  
  if (MDNS.begin("solar-monitor")) {
    MDNS.addService("http", "tcp", 80);
    Serial.println("mDNS iniciado: solar-monitor.local");
  }
  
  timeClient.begin();

  // Transicion a Sync Check
  currentAppState = SYNC_CHECK;
  stateStartTime = millis();
}

void loop() {
  // Leer valores del INA228
  readINA228();
  
  // Mantener conexion y mDNS
  if (!apMode) {
    if (wifiMulti.run() == WL_CONNECTED) {
      MDNS.update(); // Vital para que .local funcione en ESP8266
      timeClient.update();
    }
  }

  switch (currentAppState) {
    case INIT:
      break;

    case SYNC_CHECK:
      if (millis() - lastSendTime > 5000) { // Intentar sync cada 5s
        Serial.println("Estado: SYNC_CHECK...");
        trySync();
        lastSendTime = millis();
      }
      if (millis() - stateStartTime > 15000) {
        currentAppState = MONITORING;
        Serial.println("Paso a modo MONITORING.");
      }
      break;

    case MONITORING:
      if (millis() - lastSendTime > sendInterval) {
        
        Serial.print("V: "); Serial.print(busVoltage_V, 3); Serial.print("V | ");
        Serial.print("I: "); Serial.print(current_mA, 2); Serial.print("mA | ");
        Serial.print("P: "); Serial.print(power_mW, 2); Serial.print("mW | ");
        Serial.print("T: "); Serial.print(temperature_C, 1); Serial.println("°C");
        
        if (WiFi.status() == WL_CONNECTED) {
          WiFiClient client;
          HTTPClient http;
          http.setTimeout(10000); // 10s timeout
          
          String endpoint = String(serverName) + "/solar"; 
          http.begin(client, endpoint);
          http.addHeader("Content-Type", "application/json");
          
          StaticJsonDocument<256> doc;
          doc["voltage"] = busVoltage_V;
          doc["current"] = current_mA;
          doc["power"] = power_mW;
          doc["temperature"] = temperature_C;
          doc["timestamp"] = timeClient.isTimeSet() ? timeClient.getEpochTime() : (millis() / 1000);

          String jsonPayload;
          serializeJson(doc, jsonPayload);
          
          int code = http.POST(jsonPayload);
          isServerOnline = (code == 201 || code == 200);
          serverStatus = isServerOnline ? "ONLINE" : "ERROR (" + String(code) + ")";
          
          if (isServerOnline) {
            Serial.println(">>> OK: Datos solar guardados en servidor.");
          } else {
            Serial.print(">>> Error HTTP: ");
            Serial.println(code);
          }
          http.end();
        } else {
          Serial.println("WiFi Desconectado...");
        }
        lastSendTime = millis();
      }
      break;
  }
}
