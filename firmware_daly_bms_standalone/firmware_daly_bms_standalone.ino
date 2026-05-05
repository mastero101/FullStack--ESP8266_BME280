#include <WiFi.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <ESPAsyncWebServer.h>
#include <ElegantOTA.h>
#include <ESPmDNS.h>
#include "config.h"
#include "web_index.h"

/**
 * Daly BMS Standalone Monitor for ESP32
 * 
 * Hardware: ESP32
 * Features:
 *   - Local Web Dashboard (Premium Design)
 *   - MOSFET Control
 *   - ElegantOTA updates
 *   - BLE Connection to Daly BMS
 */

// BLE UUIDs
static NimBLEUUID serviceUUID("fff0");
static NimBLEUUID notifyUUID("fff1");
static NimBLEUUID writeUUID("fff2");

// Global state
NimBLEClient* pClient = nullptr;
NimBLERemoteCharacteristic* pWriteChar = nullptr;
bool bmsConnected = false;
unsigned long lastBmsMillis = 0;
unsigned long lastPollMillis = 0;
unsigned long lastConnectionFailMillis = 0;
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

void sendBmsCommand(uint8_t cmd, uint8_t state) {
  if (!pWriteChar) return;
  
  uint8_t packet[13] = {0xA5, 0x40, cmd, 0x08, state, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
  uint16_t sum = 0;
  for (int i = 0; i < 12; i++) sum += packet[i];
  packet[12] = sum & 0xFF;

  pWriteChar->writeValue(packet, 13, false);
  Serial.printf("BMS CMD 0x%02X -> %d\n", cmd, state);
}

bool connectBMS() {
  NimBLEAddress bmsAddr(bms_mac, 0); 
  
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
  
  if (cmd >= 0x90 && cmd <= 0x93) {
    lastBmsMillis = millis();
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n--- Daly BMS Standalone Monitor ---");

  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());

  NimBLEDevice::init("DalyStandalone");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  // --- Web Server Routes ---
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send_P(200, "text/html", index_html);
  });

  server.on("/api/data", HTTP_GET, [](AsyncWebServerRequest *request) {
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
    doc["connected"] = bmsConnected;
    doc["ip"] = WiFi.localIP().toString();
    doc["host"] = hostname;
    doc["rssi"] = WiFi.RSSI();
    
    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
  });

  server.on("/control", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (request->hasParam("type") && request->hasParam("state")) {
      String type = request->getParam("type")->value();
      bool state = request->getParam("state")->value() == "1";
      
      if (type == "charge") sendBmsCommand(0xDA, state ? 1 : 0);
      else if (type == "discharge") sendBmsCommand(0xDB, state ? 1 : 0);
      
      request->send(200, "application/json", "{\"status\":\"ok\"}");
    } else {
      request->send(400, "text/plain", "Missing parameters");
    }
  });

  server.on("/restart", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "Restarting...");
    delay(500);
    ESP.restart();
  });

  // --- MDNS Initialization ---
  if (MDNS.begin(hostname)) {
    Serial.println("mDNS responder started: " + String(hostname) + ".local");
    MDNS.addService("http", "tcp", 80);
  }

  ElegantOTA.begin(&server);
  server.begin();
  Serial.println("HTTP Server & ElegantOTA Ready.");
}

void loop() {
  if (!bmsConnected) {
    if (connectBMS()) {
      Serial.println("BMS Connected.");
      lastBmsMillis = millis();
      lastConnectionFailMillis = 0;
    } else {
      if (lastConnectionFailMillis == 0) lastConnectionFailMillis = millis();
      if (millis() - lastConnectionFailMillis > 600000) { // 10 min
        ESP.restart();
      }
      delay(5000);
      return;
    }
  }

  // Polling BMS Data
  if (millis() - lastPollMillis > pollInterval) {
    if (pWriteChar) {
      pWriteChar->writeValue(CMD_SOC, 13, false);
      delay(150);
      pWriteChar->writeValue(CMD_CELLS, 13, false);
      delay(150);
      pWriteChar->writeValue(CMD_TEMP, 13, false);
      delay(150);
      pWriteChar->writeValue(CMD_STATUS, 13, false);
      delay(150);
    }
    lastPollMillis = millis();
  }

  // Watchdog
  if (bmsConnected && (millis() - lastBmsMillis > 180000)) {
    Serial.println("Watchdog: Lost data flow. Reconnecting...");
    if (pClient) pClient->disconnect();
    bmsConnected = false;
  }

  ElegantOTA.loop();
  delay(10);
}
