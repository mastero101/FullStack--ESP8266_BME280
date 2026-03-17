#ifndef CONFIG_H
#define CONFIG_H

// Backend Configuration
const char* serverName = "http://192.168.1.89:7755/api"; 

// Estructura para múltiples redes (Failover)
struct WifiNetwork {
  const char* ssid;
  const char* password;
};

// Lista de redes - Agrega todas las que quieras
const WifiNetwork networks[] = {
  {"Mastero Wifi Tenda", "mastero101"},
  {"Mastero Wifi", "mastero101"}
};
const int networkCount = sizeof(networks) / sizeof(networks[0]);

#endif
