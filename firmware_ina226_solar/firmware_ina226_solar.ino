/*
  IoT Project - ESP8266 + INA226 (No OLED)
  Solar Panel Monitor
*/

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#include <INA226_WE.h>
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

// INA226 sensor (Using Wolfgang Ewald Library)
INA226_WE ina226 = INA226_WE(0x40);
float busVoltage_V = 0.0;
float current_mA = 0.0;
float power_mW = 0.0;

// Servidors para OTA y DNS
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

void trySync() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    
    Serial.print("Probando conexion a: ");
    Serial.println(serverName);

    String endpoint = String(serverName) + "/solar"; 
    http.begin(client, endpoint);
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<200> doc;
    doc["voltage"] = busVoltage_V;
    doc["current"] = current_mA;
    doc["power"] = power_mW;
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

  Serial.println("\nIniciando MasterOS Solar Panel Firmware...");
  
  // Invertir pines I2C: SDA=D1 (GPIO5), SCL=D2 (GPIO4)
  Wire.begin(D1, D2);
  
  if (!ina226.init()) {
    while (1) {
       Serial.println("INA226 ERROR: Sensor no encontrado. Revisa cableado.");
       delay(2000);
    }
  }
  
  ina226.waitUntilConversionCompleted(); // Wait for first reading
  Serial.println("INA226 detectado correctamente.");

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
    html += ".card { background: white; padding: 20px; borderRadius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }";
    html += "h1 { color: #2c3e50; } .val { font-size: 1.2em; font-weight: bold; color: #27ae60; }";
    html += "</style></head><body>";
    html += "<div class='card'><h1>Monitor Solar</h1>";
    html += "<p><b>WiFi:</b> " + wifiStatus + " (" + WiFi.SSID() + ")</p>";
    html += "<p><b>Servidor:</b> " + serverStatus + "</p>";
    html += "<hr>";
    html += "<h3>Última Lectura:</h3>";
    html += "<p>Voltaje: <span class='val'>" + String(busVoltage_V, 2) + " V</span></p>";
    html += "<p>Corriente: <span class='val'>" + String(current_mA, 1) + " mA</span></p>";
    html += "<p>Potencia: <span class='val'>" + String(power_mW, 1) + " mW</span></p>";
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
  // Leer valores del INA226
  ina226.readAndClearFlags();
  busVoltage_V = ina226.getBusVoltage_V();
  current_mA = ina226.getCurrent_mA();
  power_mW = busVoltage_V * current_mA; // Calculamos en mW explícitamente
  
  // Mantener conexion y mDNS
  if (!apMode) {
    if (wifiMulti.run() == WL_CONNECTED) {
      MDNS.update(); // <-- Vital para que .local funcione en ESP8266
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
        
        Serial.print("V: "); Serial.print(busVoltage_V); Serial.print("V | ");
        Serial.print("I: "); Serial.print(current_mA); Serial.print("mA | ");
        Serial.print("P: "); Serial.print(power_mW); Serial.println("mW");
        
        if (WiFi.status() == WL_CONNECTED) {
          WiFiClient client;
          HTTPClient http;
          http.setTimeout(10000); // 10s timeout
          
          String endpoint = String(serverName) + "/solar"; 
          http.begin(client, endpoint);
          http.addHeader("Content-Type", "application/json");
          
          StaticJsonDocument<200> doc;
          doc["voltage"] = busVoltage_V;
          doc["current"] = current_mA;
          doc["power"] = power_mW;
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
