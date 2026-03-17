/*
  ESP32 Lolin32 Lite - OLED Dashboard
  Visualizador de datos para Monitor de Batería y Solar
  Incluye ElegantOTA para actualizaciones inalámbricas.
*/

#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ElegantOTA.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESPmDNS.h>
#include "config.h"

// Configuración OLED
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Servidor Web para OTA
AsyncWebServer server(80);

// Variables de datos
float battVolt = 0.0;
float battSOC = 0.0;
float solarVolt = 0.0;
String lastDate = "--/--";
String lastTime = "--:--";
bool initialDataFetched = false;
unsigned long ipScreenStartTime = 0;
const unsigned long ipScreenDuration = 10000; // 10 segundos para ver la IP

String wifiStatus = "Desconectado";
String serverStatus = "Esperando...";
bool serverOnline = false;

unsigned long lastUpdate = 0;
const long updateInterval = 10000; // Actualizar cada 10 segundos

void setup() {
  Serial.begin(115200);

  // Inicializar OLED
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }
  
  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);
  display.setCursor(0,0);
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
    updateDisplay(); // Mostrar estado de conexión
    attempts++;
  }

  if(WiFi.status() == WL_CONNECTED) {
    wifiStatus = "CONECTADO";
    Serial.println("\nWiFi Conectado!");
    
    // Iniciar mDNS
    if (MDNS.begin("iot-display")) {
      Serial.println("mDNS iniciado: iot-display.local");
    }
  } else {
    wifiStatus = "ERROR WIFI";
  }

  // Configurar ElegantOTA
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "Display ESP32 - DashBoard IoT");
  });

  ElegantOTA.begin(&server);
  server.begin();
  MDNS.addService("http", "tcp", 80);
  
  fetchData();
}

void loop() {
  if (millis() - lastUpdate > updateInterval) {
    fetchData();
    lastUpdate = millis();
  }

  updateDisplay();
}

void fetchData() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiStatus = "CONECTADO";
    HTTPClient http;
    serverStatus = "Cargando...";
    
    // 1. Obtener Batería
    http.begin(String(serverName) + "/battery/latest");
    int httpCode = http.GET();
    
    if (httpCode == 200) {
      serverOnline = true;
      serverStatus = "ONLINE";
      StaticJsonDocument<512> doc;
      deserializeJson(doc, http.getString());
      battVolt = doc["voltage"] | 0.0;
      
      battSOC = ((battVolt - eVolt) / (fVolt - eVolt)) * 100.0;
      if (battSOC > 100.0) battSOC = 100.0;
      if (battSOC < 0.0) battSOC = 0.0;

      String createdAt = doc["created_at"]; 
      if (createdAt.length() > 16) {
        int year = createdAt.substring(0, 4).toInt();
        int month = createdAt.substring(5, 7).toInt();
        int day = createdAt.substring(8, 10).toInt();
        int hour = createdAt.substring(11, 13).toInt();
        int minute = createdAt.substring(14, 16).toInt();

        // Aplicar Offset de Tiempo
        hour += timeOffset;
        if (hour < 0) { hour += 24; day--; }
        if (hour >= 24) { hour -= 24; day++; }

        char dateBuf[12];
        char timeBuf[12];
        sprintf(dateBuf, "%02d/%02d", day, month);
        sprintf(timeBuf, "%02d:%02d", hour, minute);
        
        lastDate = String(dateBuf);
        lastTime = String(timeBuf);
      }
      
      if (!initialDataFetched) {
        initialDataFetched = true;
        ipScreenStartTime = millis(); // Empezar contador de 10s al primer éxito
      }
    } else {
      serverOnline = false;
      serverStatus = "ERROR SRV";
    }
    http.end();

    // 2. Obtener Solar
    if (serverOnline) {
      http.begin(String(serverName) + "/solar/latest");
      http.GET();
      StaticJsonDocument<512> doc;
      deserializeJson(doc, http.getString());
      solarVolt = doc["voltage"] | 0.0;
      http.end();
    }
  } else {
    wifiStatus = "PERDIDA RED";
    serverOnline = false;
  }
}

void updateDisplay() {
  display.clearDisplay();
  display.setTextColor(WHITE);

  // MODO 1: CONECTANDO / MOSTRAR IP AL INICIO
  // Se muestra hasta que se descarguen datos Y pasen 10 segundos
  if (!initialDataFetched || (millis() - ipScreenStartTime < ipScreenDuration)) {
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("SISTEMA INICIADO");
    display.drawFastHLine(0, 10, 128, WHITE);
    
    display.setCursor(0, 15);
    display.print("WiFi: "); display.println(wifiStatus);
    
    if (WiFi.status() == WL_CONNECTED) {
      display.setCursor(0, 25);
      display.print("IP:   "); display.println(WiFi.localIP().toString());
      display.setCursor(0, 35);
      display.print("Host: iot-display.local");
      
      display.setCursor(0, 48);
      if (!initialDataFetched) {
        display.println("Conectando Servidor...");
      } else {
        display.println("¡TODO ONLINE!");
        display.setCursor(0, 56);
        display.print("Iniciando en: "); 
        display.print((ipScreenDuration - (millis() - ipScreenStartTime)) / 1000);
        display.print(" seg");
      }
    }
  } 
  // MODO 2: DASHBOARD DE DATOS (VBAT, SOC, VSOL, FECHA)
  else {
    // BLOQUE 1: BATERIA (V y %)
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("BATERIA");
    display.setCursor(85, 0);
    display.print("SOC");

    display.setTextSize(2);
    display.setCursor(0, 10);
    display.print(battVolt, 1); 
    display.setCursor(display.getCursorX() + 8, 10);
    display.print("V");
    display.setCursor(80, 10);
    display.print((int)battSOC); display.print("%");

    display.drawFastHLine(0, 28, 128, WHITE);

    // BLOQUE 2: SOLAR
    display.setTextSize(1);
    display.setCursor(0, 34);
    display.print("PANELES SOLAR:");
    display.setTextSize(2);
    display.setCursor(0, 45);
    display.print(solarVolt, 1); 
    display.setCursor(display.getCursorX() + 8, 45);
    display.print("V");

    // BLOQUE 3: FECHA Y HORA (Pie de pantalla)
    display.setTextSize(1);
    display.setCursor(80, 45);
    display.print(lastDate);
    display.setCursor(80, 56);
    display.print(lastTime);
    
    if (!serverOnline) {
      display.setCursor(0, 56);
      display.print("OFFLINE!");
    }
  }

  display.display();
}
