#include <Servo.h>
#include <Stepper.h>

// --- Configuração do Servo ---
Servo servoMotor;
const int pinoServo = 9;
const int anguloNeutroServo = 180; // Posição que segura p premio
const int anguloLiberarServo = 0; // Ângulo para liberar (ajuste se necessário)

// --- Configuração do Motor de Passo ---
// Altere o número 2048 se o seu motor der mais ou menos voltas por ciclo
const int passosPorVolta = 2048; 
// Conexões no Arduino: IN1->4, IN2->6, IN3->5, IN4->7 (Sequência correta para o driver ULN2003)
Stepper passoCaneta(passosPorVolta, 4, 6, 5, 7); 
const int passosParaLiberar = 1024; // 512 passos é 1/4 de volta (90 graus). Ajuste conforme seu mecanismo.

void setup() {
  // Inicializa o Servo
  servoMotor.attach(pinoServo);
  servoMotor.write(anguloNeutroServo);

  // Inicializa o Motor de Passo (velocidade em RPM)
  passoCaneta.setSpeed(10); // Velocidade segura para o motor 28BYJ-48
}

void loop() {
  // --- EXEMPLO DE USO ---
  
  //Libera premio menor
  liberarLadoServo();
  delay(5000); // Espera 5 segundos
  
  //Libera premio maior
  liberarLadoPasso();
  delay(5000); // Espera 5 segundos
}

// Função para o Servo: vai até o ângulo de liberação e volta
void liberarLadoServo() {
  servoMotor.write(anguloLiberarServo);
  delay(600); // Tempo para a caneta cair/passar
  servoMotor.write(anguloNeutroServo); // Volta a travar
}

// Função para o Motor de Passo: avança os passos e depois retrocede
void liberarLadoPasso() {
  // Gira para frente para liberar
  passoCaneta.step(passosParaLiberar);
  delay(600); // Tempo para a caneta cair/passar
  
  // Gira exatamente a mesma quantidade para trás para voltar à posição inicial
  passoCaneta.step(-passosParaLiberar); 
}