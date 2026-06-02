from flask import Flask, jsonify, Response
from flask_cors import CORS
import cv2
from ultralytics import YOLO
import datetime
import easyocr
import base64
import threading
import re
import time

app = Flask(__name__)
CORS(app)

#  MODELO YOLO
model = YOLO("runs/detect/placas_colombianas/weights/best.pt")

#  OCR
reader = easyocr.Reader(['en'], gpu=False)

#  HISTORIAL
historial_detecciones = []

#  CONTROL DE DUPLICADOS
ultimas_placas = {}
TIEMPO_REPETICION = 5  # segundos

#  CÁMARA
camera = cv2.VideoCapture(0)
camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
camera.set(cv2.CAP_PROP_FPS, 30)

print("📷 Cámara iniciada...")

frame_actual = None
lock = threading.Lock()

frame_count = 0


#  PREPROCESAMIENTO OCR (CLAVE PARA PRECISIÓN)
def procesar_imagen_ocr(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    #  mejorar contraste
    gray = cv2.bilateralFilter(gray, 11, 17, 17)

    #  umbral adaptativo
    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY,
        11, 2
    )

    return thresh


#  VALIDACIÓN DE PLACAS COLOMBIA
def validar_placa(texto):
    # Formatos comunes: ABC123 / ABC12D
    return re.match(r'^[A-Z]{3}[0-9]{2,3}$', texto)


def camara_vigilancia():
    global frame_actual, frame_count

    print(" Sistema corriendo...")

    while True:
        success, frame = camera.read()

        if not success:
            continue

        frame = cv2.resize(frame, (640, 480))
        frame_count += 1

        with lock:
            frame_actual = frame.copy()

        #  PROCESAR CADA 4 FRAMES (MEJOR BALANCE)
        if frame_count % 4 != 0:
            continue

        results = model(frame, verbose=False)

        for result in results:
            for box in result.boxes:

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confianza = float(box.conf[0])

                if confianza < 0.65:
                    continue

                placa = frame[y1:y2, x1:x2]

                if placa.size == 0:
                    continue

                placa_procesada = procesar_imagen_ocr(placa)

                ocr_result = reader.readtext(placa_procesada)

                for (_, text, prob) in ocr_result:

                    if prob < 0.6:
                        continue

                    texto = re.sub(r'[^A-Z0-9]', '', text.upper())

                    if not (5 <= len(texto) <= 7):
                        continue

                    if not validar_placa(texto):
                        continue

                    ahora = time.time()

                    #  evitar repetir la misma placa seguido
                    if texto in ultimas_placas:
                        if ahora - ultimas_placas[texto] < TIEMPO_REPETICION:
                            continue

                    ultimas_placas[texto] = ahora

                    #  dibujar SOLO cuando detecta válido
                    with lock:
                        cv2.rectangle(frame_actual, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        cv2.putText(frame_actual, texto, (x1, y1 - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

                    #  codificar imagen
                    _, buffer = cv2.imencode('.jpg', frame_actual, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                    img_base64 = base64.b64encode(buffer).decode('utf-8')

                    nueva = {
                        "id": len(historial_detecciones) + 1,
                        "placa": texto,
                        "hora": datetime.datetime.now().strftime("%H:%M:%S"),
                        "precision_ocr": round(prob * 100, 2),
                        "precision_yolo": round(confianza * 100, 2),
                        "foto": f"data:image/jpeg;base64,{img_base64}"
                    }

                    historial_detecciones.insert(0, nueva)

                    print(f" {texto}")


#  STREAM OPTIMIZADO
def generar_frames():
    global frame_actual

    while True:
        with lock:
            if frame_actual is None:
                continue

            ret, buffer = cv2.imencode('.jpg', frame_actual, [int(cv2.IMWRITE_JPEG_QUALITY), 70])

        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' +
               frame_bytes + b'\r\n')

        time.sleep(0.03)  


@app.route('/video_feed')
def video_feed():
    return Response(
        generar_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.route('/api/detecciones')
def obtener_detecciones():
    return jsonify(historial_detecciones)


if __name__ == '__main__':
    hilo = threading.Thread(target=camara_vigilancia, daemon=True)
    hilo.start()

    app.run(debug=False, port=5000, threaded=True)