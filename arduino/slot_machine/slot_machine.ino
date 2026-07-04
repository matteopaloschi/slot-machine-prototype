#include <Servo.h>
#include <Stepper.h>

// =====================================================================
// Caça-níquel - Festa Junina - Arduino Uno
// Leitura de ficha via sensor ultrassônico HC-SR04 (4 pinos: VCC, TRIG, ECHO, GND)
// Botão de pressão para start/stop da roleta (só funciona após ficha lida)
// A lógica de sorteio/aleatorização do prêmio está em outro arquivo/sistema
// (o resultado chega via comando serial RESULT:MAJOR / RESULT:MINOR / RESULT:NONE)
// =====================================================================

const int TRIG_PIN = 6;
const int ECHO_PIN = 7;
const int BUTTON_PIN = 2;
const int SERVO_PIN = 4; 
const int BUZZER_PIN = 3;
const int LED_PIN = LED_BUILTIN;
const int TOKEN_LED_PIN = 5;  // aceso quando a ficha foi lida, apagado quando não 

// Controle dos motores de liberação do prêmio
const int SERVO_NEUTRAL_ANGLE = 180;
const int SERVO_RELEASE_ANGLE = 0;
const unsigned long SERVO_RELEASE_DELAY_MS = 600;

const int STEPPER_PIN_1 = 8;
const int STEPPER_PIN_2 = 9; 
const int STEPPER_PIN_3 = 10;
const int STEPPER_PIN_4 = 11;
const int STEPS_PER_REVOLUTION = 2048;
const int STEPS_TO_RELEASE = 1024;
const unsigned long STEPPER_RELEASE_DELAY_MS = 600;

// Distância máxima (em cm) para considerar que uma ficha foi inserida.
// 4.00cm é válido, 4.01cm em diante NÃO é considerado leitura de ficha.
const float MAX_TOKEN_DISTANCE_CM = 4.00;

// Intervalo mínimo entre leituras do sensor ultrassônico (evita leituras excessivas)
const unsigned long SENSOR_READ_INTERVAL_MS = 100;
unsigned long lastSensorReadTime = 0;

// Tempo que a distância precisa se manter dentro da faixa válida para confirmar a ficha
// (evita falso positivo por ruído de uma única leitura)
const unsigned long TOKEN_CONFIRM_TIME_MS = 150;
unsigned long tokenDetectStartTime = 0;
bool tokenDetecting = false;

Servo prizeServo;
Stepper prizeStepper(STEPS_PER_REVOLUTION, STEPPER_PIN_1, STEPPER_PIN_2, STEPPER_PIN_3, STEPPER_PIN_4);

bool tokenInserted = false;
bool gameActive = false;
bool buttonHeld = false;

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(TOKEN_LED_PIN, OUTPUT);

  digitalWrite(TRIG_PIN, LOW);
  digitalWrite(TOKEN_LED_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  buttonHeld = false;

  prizeServo.attach(SERVO_PIN);
  prizeServo.write(SERVO_NEUTRAL_ANGLE);
  prizeStepper.setSpeed(10);

  Serial.begin(9600);
  Serial.println("Slot machine ready");
}

void loop() {
  handleSerial();

  if (!tokenInserted) {
    handleTokenSensor();
  }

  handleButton();

  delay(10);
}

// ---------------------------------------------------------------------
// Mede a distância em cm usando o HC-SR04.
// Retorna -1 se não houver leitura válida (timeout / fora de alcance).
// ---------------------------------------------------------------------
float readDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // timeout de 25ms (~4m), suficiente folga para distâncias curtas como essa
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 25000UL);

  if (duration == 0) {
    return -1.0;  // sem eco / fora de alcance
  }

  // velocidade do som ~0.0343 cm/us, divide por 2 (ida e volta)
  float distanceCM = (duration * 0.0343) / 2.0;
  return distanceCM;
}

void handleTokenSensor() {
  unsigned long now = millis();
  if (now - lastSensorReadTime < SENSOR_READ_INTERVAL_MS) {
    return;
  }
  lastSensorReadTime = now;

  float distance = readDistanceCM();

  bool withinRange = (distance >= 0 && distance <= MAX_TOKEN_DISTANCE_CM);

  if (withinRange) {
    if (!tokenDetecting) {
      tokenDetecting = true;
      tokenDetectStartTime = now;
    } else if (now - tokenDetectStartTime >= TOKEN_CONFIRM_TIME_MS) {
      tokenInserted = true;
      tokenDetecting = false;
      Serial.println("TOKEN_INSERTED");
      digitalWrite(TOKEN_LED_PIN, HIGH);
    }
  } else {
    tokenDetecting = false;
  }
}

void handleButton() {
  bool currentState = digitalRead(BUTTON_PIN);

  if (currentState == LOW) {
    if (!buttonHeld) {
      buttonHeld = true;

      if (tokenInserted) {
        if (!gameActive) {
          gameActive = true;
          Serial.println("SPIN_START");
          digitalWrite(LED_PIN, HIGH);
        } else {
          gameActive = false;
          Serial.println("SPIN_STOP");
          digitalWrite(LED_PIN, LOW);
        }
      }
    }
  } else {
    buttonHeld = false;
  }
}

void handleSerial() {
  while (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command == "START") {
      if (tokenInserted) {
        gameActive = true;
        Serial.println("SPIN_START");
        digitalWrite(LED_PIN, HIGH);
      }
    } else if (command == "FICHA") {
      tokenInserted = true;
      gameActive = false;
      digitalWrite(LED_PIN, LOW);
      Serial.println("TOKEN_INSERTED");
      digitalWrite(TOKEN_LED_PIN, HIGH);
    } else if (command == "STOP") {
      gameActive = false;
      Serial.println("SPIN_STOP");
      digitalWrite(LED_PIN, LOW);
    } else if (command == "RESET") {
      tokenInserted = false;
      gameActive = false;
      tokenDetecting = false;
      prizeServo.write(0);
      digitalWrite(LED_PIN, LOW);
      digitalWrite(TOKEN_LED_PIN, LOW);
      Serial.println("RESET_OK");
    } else if (command == "RESULT:MAJOR") {
      releasePrize(true);
    } else if (command == "RESULT:MINOR") {
      releasePrize(false);
    } else if (command == "RESULT:NONE") {
      Serial.println("NO_PRIZE");
    }
  }
}

void playBuzzerPattern(int beeps, int intervalMs, int totalDurationMs) {
  unsigned long startTime = millis();
  int beepCount = 0;

  while (millis() - startTime < totalDurationMs) {
    if (beepCount < beeps) {
      digitalWrite(BUZZER_PIN, HIGH);
      delay(150);
      digitalWrite(BUZZER_PIN, LOW);
      delay(intervalMs);
      beepCount++;
    } else {
      delay(50);
    }
  }
}

void releasePrize(bool major) {
  if (major) {
    prizeStepper.step(STEPS_TO_RELEASE);
    delay(STEPPER_RELEASE_DELAY_MS);
    prizeStepper.step(-STEPS_TO_RELEASE);
    playBuzzerPattern(5, 300, 3000);
    Serial.println("PRIZE_MAJOR");
  } else {
    prizeServo.write(SERVO_RELEASE_ANGLE);
    delay(SERVO_RELEASE_DELAY_MS);
    prizeServo.write(SERVO_NEUTRAL_ANGLE);
    playBuzzerPattern(3, 300, 1500);
    Serial.println("PRIZE_MINOR");
  }
}
