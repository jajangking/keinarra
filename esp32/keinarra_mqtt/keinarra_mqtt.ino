/*
 * KEINARRA — ESP32 MQTT Robot Controller
 *
 * Flow:
 *   Next.js (browser) → MQTT over WebSocket → HiveMQ Cloud (8884)
 *   ESP32             → MQTT over TCP        → HiveMQ Cloud (1883)
 *
 * Subscribe topics:
 *   keinarra/esp32/motor   — JSON {"left":<int>,"right":<int>}  (-255..255)
 *   keinarra/esp32/buzzer  — "ON:FREQ=<hz>" / "OFF"
 *
 * Publish topics:
 *   keinarra/esp32/status  — status messages
 */

#include <WiFi.h>
#include <PubSubClient.h>

// ── WiFi ─────────────────────────────────────────────────────────────────
const char* WIFI_SSID     = "your-ssid";
const char* WIFI_PASSWORD = "your-password";

// ── MQTT ─────────────────────────────────────────────────────────────────
const char* MQTT_BROKER   = "1303127e3fac47ce811384c183c0f735.s1.eu.hivemq.cloud";
const int   MQTT_PORT     = 1883;
const char* MQTT_CLIENT_ID = "keinarra-esp32";
const char* MQTT_USER     = "keinarra";
const char* MQTT_PASS     = "Keinarra123";

const char* TOPIC_MOTOR   = "keinarra/esp32/motor";
const char* TOPIC_BUZZER  = "keinarra/esp32/buzzer";
const char* TOPIC_STATUS  = "keinarra/esp32/status";

// ── Motor pins (L298N / L293D example) ──────────────────────────────────
const int MOTOR_L_PWM = 12;
const int MOTOR_L_IN1  = 14;
const int MOTOR_L_IN2  = 27;
const int MOTOR_R_PWM  = 13;
const int MOTOR_R_IN1  = 26;
const int MOTOR_R_IN2  = 25;
const int BUZZER_PIN   = 32;

// ── Globals ──────────────────────────────────────────────────────────────
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long lastStatusMs = 0;
char msgBuf[128];

// ── Motor control ────────────────────────────────────────────────────────
void setMotor(int pwm, int in1, int in2, int speed) {
  speed = constrain(speed, -255, 255);
  if (speed > 0) {
    digitalWrite(in1, HIGH);
    digitalWrite(in2, LOW);
    ledcWrite(pwm, speed);
  } else if (speed < 0) {
    digitalWrite(in1, LOW);
    digitalWrite(in2, HIGH);
    ledcWrite(pwm, -speed);
  } else {
    digitalWrite(in1, LOW);
    digitalWrite(in2, LOW);
    ledcWrite(pwm, 0);
  }
}

void setMotors(int left, int right) {
  setMotor(MOTOR_L_PWM, MOTOR_L_IN1, MOTOR_L_IN2, left);
  setMotor(MOTOR_R_PWM, MOTOR_R_IN1, MOTOR_R_IN2, right);
}

// ── Buzzer ───────────────────────────────────────────────────────────────
void buzzerOn(int freq) {
  ledcWriteTone(BUZZER_PIN, freq);
}

void buzzerOff() {
  ledcWriteTone(BUZZER_PIN, 0);
}

// ── MQTT callback ────────────────────────────────────────────────────────
void mqttCallback(char* topic, byte* payload, unsigned int len) {
  payload[len] = '\0';
  String msg = String((char*)payload);
  String t = String(topic);

  if (t == TOPIC_MOTOR) {
    // Parse JSON: {"left":<int>,"right":<int>}
    int left = 0, right = 0;
    int li = msg.indexOf("\"left\":");
    int ri = msg.indexOf("\"right\":");
    if (li >= 0) left = msg.substring(li + 7).toInt();
    if (ri >= 0) right = msg.substring(ri + 8).toInt();
    setMotors(left, right);
    snprintf(msgBuf, sizeof(msgBuf), "motor L=%d R=%d", left, right);
    mqttClient.publish(TOPIC_STATUS, msgBuf);

  } else if (t == TOPIC_BUZZER) {
    if (msg.startsWith("ON")) {
      int fi = msg.indexOf("FREQ=");
      int freq = (fi >= 0) ? msg.substring(fi + 5).toInt() : 800;
      buzzerOn(freq);
      mqttClient.publish(TOPIC_STATUS, "buzzer ON");
    } else {
      buzzerOff();
      mqttClient.publish(TOPIC_STATUS, "buzzer OFF");
    }
  }
}

// ── Reconnect ────────────────────────────────────────────────────────────
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("MQTT connecting...");
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
      Serial.println(" connected");
      mqttClient.subscribe(TOPIC_MOTOR);
      mqttClient.subscribe(TOPIC_BUZZER);
      mqttClient.publish(TOPIC_STATUS, "ESP32 online");
    } else {
      Serial.print(" failed (");
      Serial.print(mqttClient.state());
      Serial.println(") retry in 3s");
      delay(3000);
    }
  }
}

// ── Setup ────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // Motor pins
  ledcAttach(MOTOR_L_PWM, 1000, 8);
  ledcAttach(MOTOR_R_PWM, 1000, 8);
  pinMode(MOTOR_L_IN1, OUTPUT);
  pinMode(MOTOR_L_IN2, OUTPUT);
  pinMode(MOTOR_R_IN1, OUTPUT);
  pinMode(MOTOR_R_IN2, OUTPUT);

  // Buzzer
  ledcAttach(BUZZER_PIN, 1000, 8);

  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  // MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

// ── Loop ─────────────────────────────────────────────────────────────────
void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Periodic status
  unsigned long now = millis();
  if (now - lastStatusMs > 15000) {
    lastStatusMs = now;
    mqttClient.publish(TOPIC_STATUS, "alive");
  }
}
