# Diagramas de Conexión y Hardware (Wiring)

Para facilitar la construcción y réplica física de los componentes de este proyecto, aquí se documentan los esquemas de conexión y los "pinouts" esperados por el código en cada uno de los microcontroladores.

---

## 1. Monitor BME280 (ESP8266)
*Directorio: `firmware_BME280`*

Se utiliza un ESP8266 genérico (NodeMCU o Wemos D1 Mini) conectado a un sensor BME280 y una pantalla OLED SSD1306, ambos bajo el protocolo I2C estándar.

| Componente | Pin Sensor/OLED | Pin ESP8266 | Descripción |
| :--- | :--- | :--- | :--- |
| **BME280 / OLED** | VCC | 3.3V | Alimentación de 3.3 voltios |
| **BME280 / OLED** | GND | GND | Tierra común |
| **BME280 / OLED** | SDA | D2 (GPIO4) | Datos I2C (Pin por defecto) |
| **BME280 / OLED** | SCL | D1 (GPIO5) | Reloj I2C (Pin por defecto) |

*(Nota: Pantalla y sensor se conectan en paralelo a los mismos pines I2C).*

---

## 2. Sensor Solar INA228 (ESP8266)
*Directorio: `firmware_ina228_solar`*

Para este módulo se modificó el código a fin de usar pines invertidos por comodidad de diseño o shield.

| INA228 Pin | Pin ESP8266 (Wemos/Node) | Descripción |
| :--- | :--- | :--- |
| VCC | 3.3V | Alimentación del módulo lógico |
| GND | GND | Tierra |
| **SDA** | **D1 (GPIO5)** | **Datos I2C (Invertido en código con `Wire.begin(D1, D2)`)** |
| **SCL** | **D2 (GPIO4)** | **Reloj I2C (Invertido en código)** |
| VBUS | Panel (+) | Lectura del voltaje directo desde el positivo del Panel Solar |
| IN+ / IN- | Serie con Panel (-) | El shunt debe ir intercalado en el negativo del panel solar |

---

## 3. Monitor de Batería INA226 (ESP8266)
*Directorio: `firmware_ina226`*

Lectura unificada usando los puertos I2C predeterminados de la plataforma ESP8266.

| INA226 Pin | Pin ESP8266 | Descripción |
| :--- | :--- | :--- |
| VCC | 3.3V | Alimentación |
| GND | GND | Tierra |
| SDA | D2 (GPIO4) | Datos I2C por defecto |
| SCL | D1 (GPIO5) | Reloj I2C por defecto |
| VBUS | Batería (+) | Mide el voltaje de la batería |
| IN+ / IN- | Negativo General | Se coloca el Shunt en serie desde el negativo de la Batería hacia las cargas |

---

## 4. Inversor RS232-TTL (ESP32)
*Directorio: `ESP32_Inverter_Monitor`*

La lectura de datos de inversores híbridos Voltronic (y clónicos) utiliza comunicación RS232, la cual debe convertirse a TTL (voltaje lógico de 3.3v) usando un conversor MAX3232 antes de entrar al ESP32.

| Inversor (RJ45 o DB9) | Módulo MAX3232 | Pin Lógico en ESP32 | Descripción |
| :--- | :--- | :--- | :--- |
| Pin TX (Inversor) | RX | - | Señal de ida del inversor |
| Pin RX (Inversor) | TX | - | Señal de vuelta hacia el inversor |
| GND común | GND | GND | Referencia de tierra |
| - | VCC | 3.3V | Voltaje lógico suministrado al MAX3232 |
| - | TX Lógico | **GPIO 15 (RX2)** | Recepción Serial UART2 en el código |
| - | RX Lógico | **GPIO 13 (TX2)** | Transmisión Serial UART2 en el código |

---

## 5. Hub Visualizador OLED (ESP32 Lolin32 Lite)
*Directorio: `firmware_display_oled`*

Se usa un bus I2C predeterminado para el ESP32, donde el hardware a menudo asume pines fijos.

| Pantalla OLED 1.3/0.96 | ESP32 Lolin32 Lite (Pines Estándar I2C) |
| :--- | :--- |
| VCC | 3.3V |
| GND | GND |
| SDA | GPIO 21 |
| SCL | GPIO 22 |
