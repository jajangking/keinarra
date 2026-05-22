/*
 * KEINARRA — ESP32 firmware
 *
 * Protocol (WebSocket text frames):
 *   << MOTOR:left,right        → set motor speeds (-255..255)
 *   << BUZZER:ON:FREQ=hz      → buzzer on at frequency
 *   << BUZZER:OFF              → buzzer off
 *   << PING                     → server replies PONG
 *
 * Response:
 *   >> OK
 *   >> ERROR:message
 */

#include <WiFi.h>
#include <WebSocketsServer.h>

// ══════════════════════════════════════════
// CONFIG — edit these
// ══════════════════════════════════════════
const char* WIFI_SSID = "KEINARRA";
const char* WIFI_PASS = "keinarra123";

// Motor driver pins (L298N / TB6612 / L9110S — adjust for your board)
const int MOTOR_A_PWM = 13;   // left  PWM
const int MOTOR_A_IN1 = 12;   // left  dir1
const int MOTOR_A_IN2 = 14;   // left  dir2
const int MOTOR_B_PWM = 27;   // right PWM
const int MOTOR_B_IN1 = 26;   // right dir1
const int MOTOR_B_IN2 = 25;   // right dir2

const int BUZZER_PIN  = 32;   // buzzer PWM pin

// ══════════════════════════════════════════

WebSocketsServer ws(81);
bool buzzerOn = false;
int buzzerFreq = 1000;

// ── Motor control ──────────────────────────
void motorSetup() {
  pinMode(MOTOR_A_PWM, OUTPUT);
  pinMode(MOTOR_A_IN1, OUTPUT);
  pinMode(MOTOR_A_IN2, OUTPUT);
  pinMode(MOTOR_B_PWM, OUTPUT);
  pinMode(MOTOR_B_IN1, OUTPUT);
  pinMode(MOTOR_B_IN2, OUTPUT);
  ledcSetup(0, 5000, 8);  // PWM channel 0, 5 kHz, 8-bit
  ledcSetup(1, 5000, 8);  // PWM channel 1
  ledcAttachPin(MOTOR_A_PWM, 0);
  ledcAttachPin(MOTOR_B_PWM, 1);
}

void motorA(int speed) {
  speed = constrain(speed, -255, 255);
  if (speed > 0) {
    digitalWrite(MOTOR_A_IN1, HIGH);
    digitalWrite(MOTOR_A_IN2, LOW);
  } else if (speed < 0) {
    digitalWrite(MOTOR_A_IN1, LOW);
    digitalWrite(MOTOR_A_IN2, HIGH);
  } else {
    digitalWrite(MOTOR_A_IN1, LOW);
    digitalWrite(MOTOR_A_IN2, LOW);
  }
  ledcWrite(0, abs(speed));
}

void motorB(int speed) {
  speed = constrain(speed, -255, 255);
  if (speed > 0) {
    digitalWrite(MOTOR_B_IN1, HIGH);
    digitalWrite(MOTOR_B_IN2, LOW);
  } else if (speed < 0) {
    digitalWrite(MOTOR_B_IN1, LOW);
    digitalWrite(MOTOR_B_IN2, HIGH);
  } else {
    digitalWrite(MOTOR_B_IN1, LOW);
    digitalWrite(MOTOR_B_IN2, LOW);
  }
  ledcWrite(1, abs(speed));
}

void motorsStop() {
  motorA(0);
  motorB(0);
}

// ── Buzzer ─────────────────────────────────
void buzzerSetup() {
  pinMode(BUZZER_PIN, OUTPUT);
  ledcSetup(2, 5000, 8);
  ledcAttachPin(BUZZER_PIN, 2);
}

void buzzerOnFreq(int freq) {
  buzzerFreq = freq;
  buzzerOn = true;
  ledcWriteTone(2, freq);
  ledcWrite(2, 128);  // 50% duty
}

void buzzerOff() {
  buzzerOn = false;
  ledcWrite(2, 0);
}

// ── Command parser ─────────────────────────
void parseCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd.startsWith("<< MOTOR:")) {
    String rest = cmd.substring(9);
    int comma = rest.indexOf(',');
    if (comma < 0) { ws.broadcastTXT(">> ERROR:invalid motor format"); return; }
    int left  = rest.substring(0, comma).toInt();
    int right = rest.substring(comma + 1).toInt();
    motorA(left);
    motorB(right);
    ws.broadcastTXT(">> OK MOTOR " + String(left) + "," + String(right));
    return;
  }

  if (cmd.startsWith("<< BUZZER:")) {
    String rest = cmd.substring(10);
    if (rest.startsWith("OFF")) {
      buzzerOff();
      ws.broadcastTXT(">> OK BUZZER OFF");
    } else if (rest.startsWith("ON")) {
      int eq = rest.indexOf('=');
      if (eq < 0) { ws.broadcastTXT(">> ERROR:invalid buzzer format"); return; }
      int freq = rest.substring(eq + 1).toInt();
      buzzerOnFreq(freq);
      ws.broadcastTXT(">> OK BUZZER " + String(freq) + "Hz");
    } else {
      ws.broadcastTXT(">> ERROR:unknown buzzer cmd");
    }
    return;
  }

  if (cmd == "<< PING") {
    ws.broadcastTXT(">> PONG");
    return;
  }

  ws.broadcastTXT(">> ERROR:unknown command");
}

// ── WebSocket events ───────────────────────
void onWsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      ws.sendTXT(num, ">> ESP32 SIAP");
      break;
    case WStype_DISCONNECTED:
      motorsStop();
      buzzerOff();
      break;
    case WStype_TEXT:
      parseCommand(String((char*)payload));
      break;
    default: break;
  }
}

// ── Setup ──────────────────────────────────
void setup() {
  Serial.begin(115200);
  motorSetup();
  buzzerSetup();
  motorsStop();

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  // WebSocket
  ws.begin();
  ws.onEvent(onWsEvent);
  Serial.println("WebSocket server on port 81");
}

// ── Loop ───────────────────────────────────
void loop() {
  ws.loop();
}
