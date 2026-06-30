#include <Servo.h>

// Compatible with Arduino Uno and Arduino Nano.
// The Nano uses the same digital pins for this prototype.
const int BUTTON_PIN = 2;
const int TOKEN_PIN = 3;
const int SERVO_PIN = 9;
const int LED_PIN = LED_BUILTIN;

Servo prizeServo;

bool tokenInserted = false;
bool gameActive = false;
bool lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(TOKEN_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);

  prizeServo.attach(SERVO_PIN);
  prizeServo.write(0);

  Serial.begin(9600);
  Serial.println("Slot machine ready");
}

void loop() {
  handleSerial();
  handleTokenSensor();
  handleButton();
  delay(10);
}

void handleTokenSensor() {
  if (digitalRead(TOKEN_PIN) == LOW && !tokenInserted) {
    tokenInserted = true;
    Serial.println("TOKEN_INSERTED");
    digitalWrite(LED_PIN, HIGH);
    delay(150);
  }
}

void handleButton() {
  bool currentState = digitalRead(BUTTON_PIN);
  if (currentState != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > 250) {
    if (currentState == LOW && lastButtonState == HIGH) {
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
  }

  lastButtonState = currentState;
}

void handleSerial() {
  while (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command == "START") {
      if (tokenInserted) {
        gameActive = true;
        Serial.println("SPIN_START");
      }
    } else if (command == "FICHA") {
      tokenInserted = true;
      Serial.println("TOKEN_INSERTED");
    } else if (command == "STOP") {
      gameActive = false;
      Serial.println("SPIN_STOP");
    } else if (command == "RESET") {
      tokenInserted = false;
      gameActive = false;
      prizeServo.write(0);
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

void releasePrize(bool major) {
  if (major) {
    prizeServo.write(90);
    delay(450);
    prizeServo.write(0);
    Serial.println("PRIZE_MAJOR");
  } else {
    prizeServo.write(45);
    delay(300);
    prizeServo.write(0);
    Serial.println("PRIZE_MINOR");
  }
}
