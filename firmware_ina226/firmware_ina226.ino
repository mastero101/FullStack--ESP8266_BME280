/*
  IoT Project - ESP8266 + INA226 (No OLED)
  Battery Monitor
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

#include "config.h"

// NTP Client
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", -21600); 

// INA226 sensor (Using Wolfgang Ewald Library)
INA226_WE ina226 = INA226_WE(0x40);
float busVoltage_V = 0.0;
float current_mA = 0.0;
float power_mW = 0.0;
float percent = 0.0;

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

    String endpoint = String(serverName) + "/battery"; 
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

  Serial.println("\nIniciando MasterOS Battery Firmware...");
  
  Wire.begin();
  
  if (!ina226.init()) {
    while (1) {
       Serial.println("INA226 ERROR: Sensor no encontrado. Revisa cableado.");
       delay(2000);
    }
  }
  
  ina226.waitUntilConversionCompleted(); // Wait for first reading
  Serial.println("INA226 detectado correctamente.");

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  WiFi.begin(ssid, password);
  Serial.print("Conectando a WiFi: ");
  Serial.println(ssid);
  
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
  
  // Calculo basico de porcentaje (LiFePO4 8S 25.6V nominal)
  percent = ((busVoltage_V - 22.0) / (28.4 - 22.0)) * 100.0;
  if (percent > 100.0) percent = 100.0;
  if (percent < 0.0) percent = 0.0;

  if (WiFi.status() == WL_CONNECTED) {
    timeClient.update();
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
          
          String endpoint = String(serverName) + "/battery"; 
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
          
          if (isServerOnline) {
            Serial.println(">>> OK: Datos bateria guardados en servidor.");
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
