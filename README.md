# Slot machine prototype

This prototype implements the idea of a festa junina slot machine as a visual experience on the notebook, with hardware control handled by Arduino.

## Structure
- frontend/: browser-based slot UI
- arduino/: Arduino sketch for button, token detection, and servo release

## Run the front-end
1. Open a terminal in this folder.
2. Start a local server:
   - `python -m http.server 8000`
3. Open `http://127.0.0.1:8000/frontend/` in a browser.

## Hardware notes
- Use the Arduino sketch as a starting point for a real build.
- The sketch is compatible with both Arduino Uno and Arduino Nano.
- In the Arduino IDE, select the matching board before uploading:
  - Board: Arduino Nano (or Arduino Uno)
- The sketch expects:
  - a button on pin 2
  - a token sensor/button on pin 3
  - a servo on pin 9

## Next steps
- Replace the mock token sensor with an ultrasonic or IR sensor.
- Add a stronger mechanical housing.
- Connect the browser UI to a real Arduino via Web Serial.
