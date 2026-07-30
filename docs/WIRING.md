# Diagramas de Conexión y Hardware (Wiring)

Esquemas de conexión y pinout esperados por el código de cada microcontrolador. Para instrucciones de compilación/configuración de cada firmware, ver [FIRMWARE.md](./FIRMWARE.md).

---

## 1. Monitor BME280 (ESP8266)
*Directorio: `firmware_BME280`*

ESP8266 genérico (NodeMCU o Wemos D1 Mini) conectado a un sensor BME280 y una pantalla OLED SSD1306, ambos bajo I2C estándar.

| Componente | Pin Sensor/OLED | Pin ESP8266 | Descripción |
| :--- | :--- | :--- | :--- |
| **BME280 / OLED** | VCC | 3.3V | Alimentación de 3.3 voltios |
| **BME280 / OLED** | GND | GND | Tierra común |
| **BME280 / OLED** | SDA | D2 (GPIO4) | Datos I2C (pin por defecto) |
| **BME280 / OLED** | SCL | D1 (GPIO5) | Reloj I2C (pin por defecto) |

*(Pantalla y sensor se conectan en paralelo a los mismos pines I2C.)*

---

## 2. Sensor Solar INA228 (ESP8266)
*Directorio: `firmware_ina228_solar`*

Pines I2C invertidos respecto al estándar, definidos explícitamente en el código (`Wire.begin(D1, D2)`).

| INA228 Pin | Pin ESP8266 (Wemos/Node) | Descripción |
| :--- | :--- | :--- |
| VCC | 3.3V | Alimentación del módulo lógico |
| GND | GND | Tierra |
| **SDA** | **D1 (GPIO5)** | **Datos I2C (invertido en código)** |
| **SCL** | **D2 (GPIO4)** | **Reloj I2C (invertido en código)** |
| VBUS | Panel (+) | Lectura del voltaje directo desde el positivo del panel solar |
| IN+ / IN- | Serie con Panel (-) | El shunt debe ir intercalado en el negativo del panel solar |

---

## 3. Monitor de Batería INA226 (ESP8266)
*Directorio: `firmware_ina226`*

I2C con los pines por defecto del ESP8266 (`Wire.begin()` sin argumentos).

| INA226 Pin | Pin ESP8266 | Descripción |
| :--- | :--- | :--- |
| VCC | 3.3V | Alimentación |
| GND | GND | Tierra |
| SDA | D2 (GPIO4) | Datos I2C por defecto |
| SCL | D1 (GPIO5) | Reloj I2C por defecto |
| VBUS | Batería (+) | Mide el voltaje de la batería |
| IN+ / IN- | Negativo general | Shunt en serie desde el negativo de la batería hacia las cargas |

---

## 4. Inversor RS232-TTL (ESP32)
*Directorio: `ESP32_Inverter_Monitor`*

La lectura de inversores híbridos Voltronic (y clónicos) usa RS232, que debe convertirse a TTL (3.3V lógico) mediante un módulo **MAX3232** antes de entrar al ESP32. UART2 por hardware, definido en `config.h` (`RXD2`/`TXD2`).

| Inversor (RJ45 o DB9) | Módulo MAX3232 | Pin lógico en ESP32 | Descripción |
| :--- | :--- | :--- | :--- |
| Pin TX (inversor) | RX | - | Señal de ida del inversor |
| Pin RX (inversor) | TX | - | Señal de vuelta hacia el inversor |
| GND común | GND | GND | Referencia de tierra |
| - | VCC | 3.3V | Voltaje lógico suministrado al MAX3232 |
| - | TX lógico | **GPIO 15 (RX2)** | Recepción Serial UART2 en el código |
| - | RX lógico | **GPIO 13 (TX2)** | Transmisión Serial UART2 en el código |

Baudrate: `2400` (`INVERTER_BAUD`), 8N1.

---

## 5. Hub Visualizador OLED (ESP32 Lolin32 Lite)
*Directorio: `firmware_display_oled`*

Bus I2C por defecto del ESP32 (sin remapear en código).

| Pantalla OLED 1.3"/0.96" | ESP32 Lolin32 Lite (pines estándar I2C) |
| :--- | :--- |
| VCC | 3.3V |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |

Este módulo no lee ningún sensor local: solo muestra datos obtenidos por WiFi del backend.

---

## 6. BMS Daly / JBD por Bluetooth (ESP32)
*Directorios: `firmware_daly_bms_ble` y `firmware_daly_bms_standalone`*

No requiere cableado adicional: la comunicación con el BMS es **inalámbrica (Bluetooth Low Energy)**, usando la MAC del módulo BLE integrado en el propio BMS (Daly clásico, Daly R24TM o JBD/XiaoXiang).

| Requisito | Detalle |
| :--- | :--- |
| Alimentación ESP32 | 5V (USB) o 3.3V regulados, independiente del BMS |
| Emparejamiento | Se hace por software: define la MAC del BMS en `bms_mac` dentro de `config.h`. Usa una app como *nRF Connect* para descubrirla |
| Tipo de dirección BLE | Solo aplica a `firmware_daly_bms_standalone`: `bms_addr_type` = `0` (PUBLIC, modelos Daly antiguos) o `1` (RANDOM, Daly R24TM/JBD nuevos) |
| Protocolo | Servicio `fff0` / características `fff1` (notify), `fff2` (write) para Daly clásico; servicio `ff00` para JBD (solo en la variante standalone) |

No hay pinout físico que documentar para este módulo más allá de la alimentación del ESP32.
