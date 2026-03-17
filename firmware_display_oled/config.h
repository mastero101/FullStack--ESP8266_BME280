/*
  Display firmware for ESP32 Lolin32 Lite with SSD1306 OLED
  Fetches data from IoT Backend (Battery & Solar).
*/

#ifndef CONFIG_H
#define CONFIG_H

// Network credentials
const char* ssid = "Mastero Wifi";
const char* password = "mastero101";

// Backend Configuration
const char* serverName = "http://192.168.1.89:7755/api"; 

// Bateria Config (para calculo de SOC %)
const float fVolt = 28.4;
const float eVolt = 22.0;

// Configuración de Hora (GMT)
const int timeOffset = -6; // Mexico Central (GMT-6)

#endif
