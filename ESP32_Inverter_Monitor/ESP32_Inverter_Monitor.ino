#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <ElegantOTA.h>
#include <ArduinoJson.h>
#include "config.h"
#include "web_dashboard.h"

/*
 * Monitoreo Inversor PowMr con ESP32 Lite
 * v2.1 - Loopback test integrado en setup()
 */

// --- Objetos Globales ---
AsyncWebServer server(80);
HardwareSerial InverterSerial(1); // UART1

// --- Buffer de recepción serial (frame accumulator) ---
String rxBuffer = "";
unsigned long lastByteTime = 0;
#define FRAME_TIMEOUT_MS 300

// --- Logs de Sistema ---
String systemLog = "";
void addLog(String msg) {
  Serial.println(msg); // También al monitor serial USB
  systemLog += "[" + String(millis() / 1000) + "s] " + msg + "\n";
  if (systemLog.length() > 3000) systemLog = systemLog.substring(800);
}

// --- Estructura de Datos ---
struct InverterData {
  float ac_v = 0, ac_f = 0, out_v = 0, out_f = 0, bus_v = 0, batt_v = 0, pv_v = 0, scc_v = 0;
  int out_va = 0, out_w = 0, load_p = 0, batt_c = 0, batt_cap = 0, temp = 0, pv_c = 0, batt_d = 0, pv_w = 0, batt_w = 0;
  uint32_t last_update = 0;
  int parse_errors = 0;
  int frames_received = 0;
};

InverterData inv;
int tx_count = 0;
int rx_count = 0;

// --- CRC16 Voltronic ---
uint16_t cal_crc_half(uint8_t* pin, uint8_t len) {
  uint16_t crc;
  uint8_t da;
  uint8_t* ptr;
  uint16_t crc_ta[16] = {
    0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7,
    0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef
  };
  ptr = pin;
  crc = 0;
  while (len-- > 0) {
    da = ((uint8_t)(crc >> 8)) >> 4;
    crc <<= 4;
    crc ^= crc_ta[da ^ (*ptr >> 4)];
    da = ((uint8_t)(crc >> 8)) >> 4;
    crc <<= 4;
    crc ^= crc_ta[da ^ (*ptr & 0x0f)];
    ptr++;
  }
  uint8_t bCRCLow  = crc;
  uint8_t bCRCHign = (uint8_t)(crc >> 8);
  if (bCRCLow  == 0x28 || bCRCLow  == 0x0d || bCRCLow  == 0x0a) bCRCLow++;
  if (bCRCHign == 0x28 || bCRCHign == 0x0d || bCRCHign == 0x0a) bCRCHign++;
  return (((uint16_t)bCRCHign) << 8) + bCRCLow;
}

// --- Enviar Comando ---
void sendInverterCommand(const char* cmd) {
  uint8_t buffer[64];
  int len = strlen(cmd);
  memcpy(buffer, cmd, len);
  uint16_t crc = cal_crc_half(buffer, len);
  buffer[len]     = (uint8_t)(crc >> 8);
  buffer[len + 1] = (uint8_t)(crc & 0xFF);
  buffer[len + 2] = 0x0D;

  String hexLog = "TX [" + String(cmd) + "] bytes: ";
  for (int i = 0; i < len + 3; i++) {
    if (buffer[i] < 0x10) hexLog += "0";
    hexLog += String(buffer[i], HEX) + " ";
  }
  addLog(hexLog);
  InverterSerial.write(buffer, len + 3);
  tx_count++;
}

// --- Parsear QPIGS ---
void parseQPIGS(String response) {
  response.trim();
  if (response.length() < 10) {
    addLog("WARN: Frame corto (" + String(response.length()) + " bytes).");
    inv.parse_errors++; return;
  }
  if (!response.startsWith("(")) {
    String hexDump = "WARN: No inicia con '('. Bytes: ";
    for (int i = 0; i < min((int)response.length(), 8); i++) {
      if ((uint8_t)response[i] < 0x10) hexDump += "0";
      hexDump += String((uint8_t)response[i], HEX) + " ";
    }
    addLog(hexDump);
    inv.parse_errors++; return;
  }

  char buf[256];
  response.substring(1).toCharArray(buf, 256);
  float ac_v, ac_f, out_v, out_f, bus_v, batt_v, pv_v, scc_v;
  int out_va, out_w, load_p, batt_c, batt_cap, temp, pv_c, batt_d, pv_w;
  char status[20];
  int v1, v2;

  int result = sscanf(buf, "%f %f %f %f %d %d %d %f %f %d %d %d %d %f %f %d %s %d %d %d",
    &ac_v, &ac_f, &out_v, &out_f, &out_va, &out_w, &load_p, &bus_v, &batt_v,
    &batt_c, &batt_cap, &temp, &pv_c, &pv_v, &scc_v, &batt_d, status, &v1, &v2, &pv_w);

  if (result >= 14) {
    inv.ac_v = ac_v; inv.ac_f = ac_f; inv.out_v = out_v; inv.out_f = out_f;
    inv.out_va = out_va; inv.out_w = out_w; inv.load_p = load_p;
    inv.bus_v = bus_v; inv.batt_v = batt_v; inv.batt_c = batt_c;
    inv.batt_cap = batt_cap; inv.temp = temp; inv.pv_c = pv_c;
    inv.pv_v = pv_v; inv.scc_v = scc_v; inv.batt_d = batt_d;
    
    // Cálculos de Potencia (Watts)
    inv.pv_w = (result >= 20 && pv_w > 0) ? pv_w : (int)(pv_v * pv_c);
    inv.batt_w = (int)(inv.batt_v * (batt_c - batt_d));
    
    inv.last_update = millis();
    inv.frames_received++;
    rx_count++;
    addLog("OK: Datos actualizados. PV: " + String(inv.pv_w) + "W | BATT: " + String(inv.batt_w) + "W");
  } else {
    addLog("ERROR: sscanf extrajo " + String(result) + " campos. Raw: " + response.substring(0, 40));
    inv.parse_errors++;
  }
}

void parseQID(String response) {
  response.trim();
  if (response.startsWith("(")) {
    addLog("QID OK - Serial: " + response.substring(1, response.length() - 3));
    rx_count++;
  } else {
    addLog("QID sin respuesta valida.");
  }
}

// ============================================================
// LOOPBACK TEST
// Prueba RX=13/TX=15 y si falla prueba RX=4/TX=2
// Requiere puente fisico entre los pines RX y TX que se prueban
// ============================================================
void runLoopbackTest(int rxPin, int txPin) {
  addLog("--- Probando RX=" + String(rxPin) + " TX=" + String(txPin) + " ---");
  InverterSerial.end();
  delay(50);
  InverterSerial.begin(INVERTER_BAUD, SERIAL_8N1, rxPin, txPin);
  delay(100);

  // Flush
  while (InverterSerial.available()) InverterSerial.read();

  const char* testMsg = "LOOPBACK_OK";
  InverterSerial.print(testMsg);
  InverterSerial.flush();

  unsigned long t = millis();
  String echo = "";
  while (millis() - t < 600) {
    while (InverterSerial.available()) echo += (char)InverterSerial.read();
    if (echo.length() >= strlen(testMsg)) break;
    delay(5);
  }

  if (echo == testMsg) {
    addLog("LOOPBACK EXITO en RX=" + String(rxPin) + " TX=" + String(txPin));
    addLog(">>> USA ESTOS PINES en config.h <<<");
  } else if (echo.length() > 0) {
    addLog("LOOPBACK PARCIAL: recibido '" + echo + "' (" + String(echo.length()) + " bytes)");
  } else {
    addLog("LOOPBACK FALLO: no se recibio nada.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  InverterSerial.begin(INVERTER_BAUD, SERIAL_8N1, RXD2, TXD2);
  delay(100);

  addLog("UART1 iniciado: " + String(INVERTER_BAUD) + " baud | RX=" + String(RXD2) + " TX=" + String(TXD2));
  addLog("=== INICIANDO LOOPBACK TESTS ===");
  addLog("Asegurate de tener puente fisico entre los pines que se prueban");

  // Probar combinaciones de pines comunes en ESP32 Lite
  runLoopbackTest(13, 15); // Config actual
  runLoopbackTest(4,  2);  // Alternativa 1
  runLoopbackTest(26, 25); // Alternativa 2
  runLoopbackTest(19, 18); // Alternativa 3

  // Restaurar config original para el loop normal
  InverterSerial.end();
  delay(50);
  InverterSerial.begin(INVERTER_BAUD, SERIAL_8N1, RXD2, TXD2);
  addLog("=== FIN LOOPBACK TESTS ===");
  addLog("UART restaurado a RX=" + String(RXD2) + " TX=" + String(TXD2));

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500); retry++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    addLog("WiFi conectado. IP: " + WiFi.localIP().toString());
  } else {
    addLog("WiFi FALLO.");
  }

  server.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
    request->send_P(200, "text/html", DASHBOARD_HTML);
  });

  server.on("/api/data", HTTP_GET, [](AsyncWebServerRequest* request) {
    DynamicJsonDocument doc(1024);
    doc["ac_v"]         = inv.ac_v;
    doc["ac_f"]         = inv.ac_f;
    doc["out_v"]        = inv.out_v;
    doc["out_f"]        = inv.out_f;
    doc["out_va"]       = inv.out_va;
    doc["out_w"]        = inv.out_w;
    doc["load_p"]       = inv.load_p;
    doc["bus_v"]        = inv.bus_v;
    doc["batt_v"]       = inv.batt_v;
    doc["batt_c"]       = inv.batt_c;
    doc["batt_cap"]     = inv.batt_cap;
    doc["temp"]         = inv.temp;
    doc["pv_c"]         = inv.pv_c;
    doc["pv_v"]         = inv.pv_v;
    doc["pv_w"]         = inv.pv_w;
    doc["scc_v"]        = inv.scc_v;
    doc["batt_d"]       = inv.batt_d;
    doc["batt_w"]       = inv.batt_w;
    doc["last_sync"]    = (millis() - inv.last_update) / 1000;
    doc["tx_count"]     = tx_count;
    doc["rx_count"]     = rx_count;
    doc["parse_errors"] = inv.parse_errors;
    doc["frames_ok"]    = inv.frames_received;
    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
  });

  server.on("/api/log", HTTP_GET, [](AsyncWebServerRequest* request) {
    request->send(200, "text/plain", systemLog);
  });

  server.on("/api/restart", HTTP_GET, [](AsyncWebServerRequest* request) {
    request->send(200, "text/plain", "Reiniciando...");
    delay(1000); ESP.restart();
  });

  server.on("/api/cmd", HTTP_GET, [](AsyncWebServerRequest* request) {
    if (request->hasParam("q")) {
      String cmd = request->getParam("q")->value();
      addLog("CMD manual: " + cmd);
      sendInverterCommand(cmd.c_str());
      request->send(200, "text/plain", "Enviado: " + cmd);
    } else {
      request->send(400, "text/plain", "Falta ?q=COMANDO");
    }
  });

  ElegantOTA.begin(&server, OTA_USER, OTA_PASS);
  ElegantOTA.setAutoReboot(true);
  server.begin();
  addLog("Servidor Web iniciado.");
}

unsigned long lastPoll      = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastSendTime  = 0;

void sendDataToBackend() {
  if (WiFi.status() != WL_CONNECTED || (millis() - inv.last_update > 20000)) return; // Solo si hay datos frescos
  
  HTTPClient http;
  http.begin(serverName);
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument doc(1024);
  doc["ac_v"] = (int)inv.ac_v; // Cast opcional o dejar float
  doc["ac_f"] = inv.ac_f;
  doc["out_v"] = inv.out_v;
  doc["out_f"] = inv.out_f;
  doc["out_va"] = inv.out_va;
  doc["out_w"] = inv.out_w;
  doc["load_p"] = inv.load_p;
  doc["bus_v"] = inv.bus_v;
  doc["batt_v"] = inv.batt_v;
  doc["batt_c"] = inv.batt_c;
  doc["batt_cap"] = inv.batt_cap;
  doc["temp"] = inv.temp;
  doc["pv_c"] = inv.pv_c;
  doc["pv_v"] = inv.pv_v;
  doc["pv_w"] = inv.pv_w;
  doc["scc_v"] = inv.scc_v;
  doc["batt_d"] = inv.batt_d;
  doc["batt_w"] = inv.batt_w;
  doc["timestamp"] = millis() / 1000; // El backend prefiere Epoch si es posible, pero usaremos esto
  
  String json;
  serializeJson(doc, json);
  int httpCode = http.POST(json);
  
  if (httpCode == 201 || httpCode == 200) {
    addLog("Backup OK: Datos sincronizados con servidor.");
  } else {
    addLog("Error Backup: HTTP " + String(httpCode));
  }
  http.end();
}

void loop() {
  if (millis() - lastPoll > POLL_INTERVAL_MS) {
    lastPoll = millis();
    addLog("Enviando QPIGS...");
    sendInverterCommand("QPIGS");
  }

  if (millis() - lastHeartbeat > 30000) {
    lastHeartbeat = millis();
    addLog("Heartbeat | TX=" + String(tx_count) + " RX=" + String(rx_count) + " Errors=" + String(inv.parse_errors));
  }

  if (millis() - lastSendTime > SEND_INTERVAL_MS) {
    lastSendTime = millis();
    sendDataToBackend();
  }

  while (InverterSerial.available()) {
    char c = (char)InverterSerial.read();
    rxBuffer += c;
    lastByteTime = millis();
  }

  if (rxBuffer.length() > 0 && (millis() - lastByteTime) > FRAME_TIMEOUT_MS) {
    addLog("RECIBIDO (" + String(rxBuffer.length()) + " bytes): " + rxBuffer.substring(0, 60));
    if (rxBuffer.length() < 20) {
      parseQID(rxBuffer);
    } else {
      parseQPIGS(rxBuffer);
    }
    rxBuffer = "";
  }

  ElegantOTA.loop();
}