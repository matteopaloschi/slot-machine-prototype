// Sketch de diagnóstico mantido apenas como referência.
// Este arquivo foi desativado para evitar conflitos de compilação com o sketch principal.
// O arquivo principal é slot_machine.ino.

#if 0
const int BUTTON_PIN = 2;
const int TOKEN_LED_PIN = 8;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(TOKEN_LED_PIN, OUTPUT);
  digitalWrite(TOKEN_LED_PIN, LOW);
  Serial.begin(9600);
  Serial.println("Diagnostico iniciado. Aperte o botao.");
}

void loop() {
  int buttonState = digitalRead(BUTTON_PIN);
  int ledState = digitalRead(TOKEN_LED_PIN);

  Serial.print("BUTTON_PIN(2)=");
  Serial.print(buttonState == LOW ? "PRESSIONADO" : "solto");
  Serial.print("   TOKEN_LED_PIN(8)=");
  Serial.println(ledState == HIGH ? "ACESO" : "apagado");

  delay(300);
}
#endif
