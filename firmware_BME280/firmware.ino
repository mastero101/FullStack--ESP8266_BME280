/*
  IoT Project - ESP8266 + BME280 + SSD1306 OLED
  Multi-Screen Industrial UI
*/

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <U8g2lib.h>
#include <ArduinoJson.h>

#define SEALEVELPRESSURE_HPA (1013.25)

// OLED Display Configuration
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, /* reset=*/ U8X8_PIN_NONE);

#include "config.h"

// NTP Client
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", -21600); 

// BME280 sensor
Adafruit_BME280 bme; 
float temperature, humidity, pressure, heatIndex;

// State Control
enum AppState { SPLASH, SYNC_CHECK, MONITORING };
AppState currentAppState = SPLASH;
unsigned long stateStartTime = 0;
bool isServerOnline = false;

// Timers
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 60000; // 60 segundos (1 min)
unsigned long lastDisplayTime = 0;
const unsigned long displayInterval = 500; // 500ms refresh (Tiempo real)

// --- UI Screens ---

void drawSplashScreen() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_open_iconic_weather_4x_t);
  u8g2.drawGlyph(48, 40, 69); // Sun/Cloud icon
  u8g2.setFont(u8g2_font_helvB08_tr);
  u8g2.drawStr(32, 55, "MASTEROS IoT");
  u8g2.sendBuffer();
  delay(1500);
  
  for (int i = 0; i <= 100; i += 5) {
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_helvB08_tr);
    u8g2.drawStr(35, 30, "Iniciando...");
    u8g2.drawFrame(10, 40, 108, 10);
    u8g2.drawBox(12, 42, (i * 104 / 100), 6);
    u8g2.sendBuffer();
    delay(50);
  }
}

void drawSyncScreen() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_helvB10_tr);
  u8g2.drawStr(15, 20, "Sincronizando...");
  
  u8g2.setFont(u8g2_font_helvB08_tr);
  u8g2.drawStr(5, 40, "WiFi:");
  if (WiFi.status() == WL_CONNECTED) {
    u8g2.drawStr(50, 40, "CONECTADO");
  } else {
    u8g2.drawStr(50, 40, "BUSCANDO...");
    Serial.print("Status WiFi: ");
    Serial.println(WiFi.status());
  }
  
  u8g2.drawStr(5, 55, "Server:");
  u8g2.drawStr(50, 55, isServerOnline ? "ONLINE" : "PENDIENTE...");
  
  u8g2.sendBuffer();
}

void drawMonitoringScreen() {
  u8g2.clearBuffer();
  
  char temp_str[10], hum_str[10], pres_str[10], hi_str[10];
  dtostrf(temperature, 4, 1, temp_str);
  dtostrf(humidity, 0, 0, hum_str);
  dtostrf(pressure, 0, 0, pres_str);
  dtostrf(heatIndex, 4, 1, hi_str);

  // --- TEMPERATURA (MUY GRANDE - Mostramos HI por peticion) ---
  u8g2.setFont(u8g2_font_inr21_mf); 
  u8g2.drawStr(0, 22, hi_str);
  u8g2.setFont(u8g2_font_helvB14_tr);
  u8g2.drawStr(95, 22, "C");

  // --- FILA 2: HUMEDAD Y TEMP REAL ---
  u8g2.setFont(u8g2_font_helvB12_tr);
  u8g2.drawStr(0, 44, "H:");
  u8g2.drawStr(20, 44, hum_str);
  u8g2.drawStr(45, 44, "%");
  
  u8g2.drawStr(65, 44, "T:");
  u8g2.drawStr(90, 44, temp_str);

  // --- FILA 3: PRESION ---
  u8g2.drawStr(0, 64, "P:");
  u8g2.drawStr(25, 64, pres_str);
  u8g2.drawStr(65, 64, "hPa");

  u8g2.sendBuffer();
}

// --- Logic ---

void trySync() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    
    Serial.print("Probando conexion a: ");
    Serial.println(serverName);

    http.begin(client, serverName);
    http.addHeader("Content-Type", "application/json");
    
    // Enviamos una lectura real para que el server lo acepte
    StaticJsonDocument<200> doc;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;
    doc["pressure"] = pressure;
    doc["heat_index"] = heatIndex;
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
  u8g2.begin();
  u8g2.setContrast(20);

  // 1. Splash
  drawSplashScreen();
  
  if (!bme.begin(0x76)) {
    while (1) {
       u8g2.clearBuffer();
       u8g2.drawStr(10, 30, "BME280 ERROR");
       u8g2.sendBuffer();
       delay(1000);
    }
  }

  WiFi.mode(WIFI_STA); // Forzar modo estacion
  WiFi.disconnect();    // Limpiar configuraciones previas
  delay(100);

  WiFi.begin(ssid, password);
  Serial.print("Conectando a: ");
  Serial.println(ssid);
  
  timeClient.begin();
  
  // 2. Transicion a Sync Check
  currentAppState = SYNC_CHECK;
  stateStartTime = millis();
}

void loop() {
  // Siempre leer sensor
  temperature = bme.readTemperature();
  humidity = bme.readHumidity();
  pressure = bme.readPressure() / 100.0F;
  
  float tf = temperature * 1.8 + 32;
  float hi = 0.5 * (tf + 61.0 + ((tf - 68.0) * 1.2) + (humidity * 0.094));
  if (hi > 79) hi = -42.379 + 2.04901523 * tf + 10.14333127 * humidity + -0.22475541 * tf * humidity + -0.00683783 * pow(tf, 2) + -0.05481717 * pow(humidity, 2) + 0.00122874 * pow(tf, 2) * humidity + 0.00085282 * tf * pow(humidity, 2) + -0.00000199 * pow(tf, 2) * pow(humidity, 2);
  heatIndex = (hi - 32) / 1.8;

  if (WiFi.status() == WL_CONNECTED) {
    timeClient.update();
  }

  switch (currentAppState) {
    case SYNC_CHECK:
      drawSyncScreen();
      if (millis() - lastSendTime > 5000) { // Intentar sync cada 5s
        trySync();
        lastSendTime = millis();
      }
      // Pasar a monitoreo despues de 15s sin importar el resultado
      if (millis() - stateStartTime > 15000) {
        currentAppState = MONITORING;
      }
      break;

    case MONITORING:
      if (millis() - lastDisplayTime > displayInterval) {
        drawMonitoringScreen();
        lastDisplayTime = millis();
      }
      
      // Envio periodico al servidor
      if (millis() - lastSendTime > sendInterval) {
        if (WiFi.status() == WL_CONNECTED) {
          WiFiClient client;
          HTTPClient http;
          http.setTimeout(10000); // 10s timeout robusto
          http.begin(client, serverName);
          http.addHeader("Content-Type", "application/json");
          
          StaticJsonDocument<200> doc;
          doc["temperature"] = temperature;
          doc["humidity"] = humidity;
          doc["pressure"] = pressure;
          doc["heat_index"] = heatIndex;
          doc["timestamp"] = timeClient.isTimeSet() ? timeClient.getEpochTime() : (millis() / 1000);

          String jsonPayload;
          serializeJson(doc, jsonPayload);
          
          Serial.print("Enviando a: ");
          Serial.println(serverName);

          int code = http.POST(jsonPayload);
          isServerOnline = (code == 201 || code == 200);
          
          if (isServerOnline) {
            Serial.println(">>> OK: Datos guardados");
          } else {
            Serial.print(">>> Error HTTP: ");
            Serial.println(code);
            if (code < 0) {
              Serial.print("Error conectando: ");
              Serial.println(http.errorToString(code).c_str());
            }
          }
          http.end();
        }
        lastSendTime = millis();
      }
      break;
      
    case SPLASH: break;
  }
}
