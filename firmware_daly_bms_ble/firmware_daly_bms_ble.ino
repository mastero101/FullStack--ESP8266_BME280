#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <ESPAsyncWebServer.h>
#include <ElegantOTA.h>
#include "config.h"

/**
 * Daly BMS BLE Bridge for ESP32
 * 
 * Hardware: ESP32 (Lolin32, DevKit, etc.)
 * Libraries: 
 *   - NimBLE-Arduino (h2zero)
 *   - ArduinoJson (Benoit Blanchon)
 *   - ESPAsyncWebServer
 *   - ElegantOTA
 * 
 * Configured via config.h
 */

// BLE UUIDs
static NimBLEUUID serviceUUID("fff0");
static NimBLEUUID notifyUUID("fff1");
static NimBLEUUID writeUUID("fff2");

// Global state
NimBLEClient* pClient = nullptr;
NimBLERemoteCharacteristic* pWriteChar = nullptr;
bool bmsConnected = false;
unsigned long lastBmsMillis = 0; // Marca de tiempo de la última notificación recibida
unsigned long lastSendMillis = 0;
const long sendInterval = 60000;
unsigned long lastConnectionFailMillis = 0; // Para el reset de emergencia
AsyncWebServer server(80);

struct BMSData {
  float voltage = 0;
  float current = 0;
  float soc = 0;
  float cell_max_v = 0;
  float cell_min_v = 0;
  int cell_max_num = 0;
  int cell_min_num = 0;
  float temp1 = 0;
  bool charge_mos = false;
  bool discharge_mos = false;
} bmsData;

// Daly Commands (13 bytes)
const uint8_t CMD_SOC[]    = {0xA5, 0x40, 0x90, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7D};
const uint8_t CMD_CELLS[]  = {0xA5, 0x40, 0x91, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7E};
const uint8_t CMD_TEMP[]   = {0xA5, 0x40, 0x92, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7F};
const uint8_t CMD_STATUS[] = {0xA5, 0x40, 0x93, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80};

void sendBmsCommand(uint8_t cmd, uint8_t state) {
  if (!pWriteChar) return;
  
  uint8_t packet[13] = {0xA5, 0x40, cmd, 0x08, state, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
  uint16_t sum = 0;
  for (int i = 0; i < 12; i++) sum += packet[i];
  packet[12] = sum & 0xFF;

  pWriteChar->writeValue(packet, 13, false);
  Serial.printf("BMS CMD 0x%02X -> %d\n", cmd, state);
}

void notifyCallback(NimBLERemoteCharacteristic* pRemoteCharacteristic, uint8_t* pData, size_t length, bool isNotify);

class ClientCallbacks : public NimBLEClientCallbacks {
  void onConnect(NimBLEClient* pClient) {
    Serial.println(">>> BMS Conectado.");
    bmsConnected = true;
  }
  void onDisconnect(NimBLEClient* pClient) {
    Serial.println(">>> BMS Desconectado.");
    bmsConnected = false;
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("\n--- Daly BMS BLE Bridge Initializing ---");

  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());

  NimBLEDevice::init("DalyBridgeESP32");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9); // Max Power

  // --- CONFIGURACIÓN SERVIDOR WEB Y OTA ---
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "Daly BMS Bridge Online. Use /update for OTA.");
  });

  server.on("/control", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (request->hasParam("type") && request->hasParam("state")) {
      String type = request->getParam("type")->value();
      bool state = request->getParam("state")->value() == "1";
      
      if (type == "charge") sendBmsCommand(0xDA, state ? 1 : 0);
      else if (type == "discharge") sendBmsCommand(0xDB, state ? 1 : 0);
      
      request->send(200, "application/json", "{\"status\":\"ok\"}");
    } else {
      request->send(400, "text/plain", "Missing parameters (type, state)");
    }
  });

  ElegantOTA.begin(&server);
  server.begin();
  Serial.println("Servidor HTTP e ElegantOTA iniciado.");
}

bool connectBMS() {
  NimBLEAddress bmsAddr(bms_mac, 0); // 0 = Public address type
  
  if (pClient) {
    NimBLEDevice::deleteClient(pClient);
  }
  
  pClient = NimBLEDevice::createClient();
  pClient->setClientCallbacks(new ClientCallbacks());

  Serial.println("Connecting to BMS at " + String(bms_mac));
  if (!pClient->connect(bmsAddr)) {
    Serial.println("Connection Failed.");
    return false;
  }

  NimBLERemoteService* pService = pClient->getService(serviceUUID);
  if (!pService) {
    Serial.println("Service FFF0 not found.");
    pClient->disconnect();
    return false;
  }

  pWriteChar = pService->getCharacteristic(writeUUID);
  NimBLERemoteCharacteristic* pNotifyChar = pService->getCharacteristic(notifyUUID);

  if (!pWriteChar || !pNotifyChar) {
    Serial.println("Characteristics not found.");
    pClient->disconnect();
    return false;
  }

  if (pNotifyChar->canNotify()) {
    if (!pNotifyChar->subscribe(true, notifyCallback)) {
      Serial.println("Subscribe Failed.");
      pClient->disconnect();
      return false;
    }
  }

  return true;
}

void notifyCallback(NimBLERemoteCharacteristic* pRemoteCharacteristic, uint8_t* pData, size_t length, bool isNotify) {
  if (length < 13) return;
  
  uint8_t cmd = pData[2];
  
  if (cmd == 0x90) { // SOC
    bmsData.voltage = ((pData[4] << 8) | pData[5]) / 10.0;
    int raw_curr = (pData[8] << 8) | pData[9];
    bmsData.current = (raw_curr - 30000) / 10.0;
    bmsData.soc = ((pData[10] << 8) | pData[11]) / 10.0;
  } 
  else if (cmd == 0x91) { // Cells
    bmsData.cell_max_v = ((pData[4] << 8) | pData[5]) / 1000.0;
    bmsData.cell_max_num = pData[6];
    bmsData.cell_min_v = ((pData[7] << 8) | pData[8]) / 1000.0;
    bmsData.cell_min_num = pData[9];
  }
  else if (cmd == 0x92) { // Temperatures
    bmsData.temp1 = pData[4] - 40;
  }
  else if (cmd == 0x93) { // Status (MOSFETs)
    bmsData.charge_mos = pData[5] == 1;
    bmsData.discharge_mos = pData[6] == 1;
  }
  
  // Marcar que hemos recibido datos válidos
  if (cmd >= 0x90 && cmd <= 0x93) {
    lastBmsMillis = millis();
  }
}

void sendDataToAPI() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(api_url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> doc;
  doc["voltage"] = bmsData.voltage;
  doc["current"] = bmsData.current;
  doc["soc"] = bmsData.soc;
  doc["cell_max_v"] = bmsData.cell_max_v;
  doc["cell_min_v"] = bmsData.cell_min_v;
  doc["cell_max_num"] = bmsData.cell_max_num;
  doc["cell_min_num"] = bmsData.cell_min_num;
  doc["temp1"] = bmsData.temp1;
  doc["charge_mos"] = bmsData.charge_mos;
  doc["discharge_mos"] = bmsData.discharge_mos;

  String body;
  serializeJson(doc, body);
  
  // Watchdog: Solo enviar a la API si tenemos datos frescos (últimos 150 seg - 2.5 min)
  if (millis() - lastBmsMillis < 150000) {
    int code = http.POST(body);
    Serial.println("API POST Response: " + String(code));
  } else {
    Serial.println("!!! Datos BMS CADUCADOS. No se envían a la API para evitar reportes falsos.");
  }
  http.end();
}

void loop() {
  if (!bmsConnected) {
    if (connectBMS()) {
      Serial.println("BMS Connected and Subscribed.");
      lastBmsMillis = millis(); // Resetear al conectar
      lastConnectionFailMillis = 0;
    } else {
      if (lastConnectionFailMillis == 0) lastConnectionFailMillis = millis();
      
      // Si lleva 10 minutos sin poder conectar al BMS, reiniciar ESP32 por seguridad
      if (millis() - lastConnectionFailMillis > 600000) {
        Serial.println("Fallo persistente de conexión. Reiniciando hardware...");
        ESP.restart();
      }
      delay(5000);
      return;
    }
  }

  // --- Watchdog de Datos Zombi ---
  // Si estamos "conectados" pero no ha llegado ni un dato real en 3 minutos, forzar desconexión
  if (bmsConnected && (millis() - lastBmsMillis > 180000)) {
    Serial.println("Watchdog: No se reciben datos del BMS. Forzando reconexión...");
    if (pClient) pClient->disconnect();
    bmsConnected = false;
    return;
  }

  // Polling BMS Data cada sendInterval (60s)
  if (millis() - lastSendMillis > sendInterval) {
    Serial.println("Polling BMS Data...");
    
    if (pWriteChar) {
      pWriteChar->writeValue(CMD_SOC, 13, false);
      delay(200);
      pWriteChar->writeValue(CMD_CELLS, 13, false);
      delay(200);
      pWriteChar->writeValue(CMD_TEMP, 13, false);
      delay(200);
      pWriteChar->writeValue(CMD_STATUS, 13, false);
      delay(200);
    }
    
    sendDataToAPI();
    lastSendMillis = millis();
  }
  
  ElegantOTA.loop();
  delay(10);
}
