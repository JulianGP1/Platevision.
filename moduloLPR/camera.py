from flask import Flask, jsonify, Response
from flask_cors import CORS
import cv2
from ultralytics import YOLO
import datetime
import easyocr
import base64
import threading

app = Flask(__name__)
CORS(app)

model = YOLO("runs/detect/placas_colombianas/weights/best.pt")
reader = easyocr.Reader(['es'])

historial_detecciones = []


#camera = cv2.VideoCapture(0) #cap

print("Cámara abierta. Buscando placa...")

def camara_vigilancia():
    """Función que corre en segundo plano procesando la cámara sin parar"""
    global historial_detecciones
    camera = cv2.VideoCapture(0)
    confianza_minima = 0.75

    
    print("-> Cámara de vigilancia encendida y procesando...")
    
    while True:
        success, frame = camera.read()
        if not success:
            continue
            
        # 1. Pasar el frame por YOLO
        results = model(frame, verbose=False)
        
        for result in results:
            for box in result.boxes:
                # Coordenadas del objeto detectado
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confianza_yolo = float(box.conf[0])
                
                # Puedes filtrar aquí por el ID de la clase de tu matrícula (ej: box.cls == 0)
                # Dibujamos el rectángulo en el frame
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                
                # 2. Recortar la placa para pasarla a EasyOCR
                placa_recortada = frame[y1:y2, x1:x2]
                
                if placa_recortada.size > 0:
                    # Pasar a escala de grises para ayudar al OCR
                    gray = cv2.cvtColor(placa_recortada, cv2.COLOR_BGR2GRAY)
                    ocr_result = reader.readtext(gray)
                    
                    for (bbox, text, prob) in ocr_result:
                        # Filtro de precisión: Solo registramos si EasyOCR está seguro a más del 50%
                        if prob > 0.5:
                            texto_placa = text.upper().replace(" ", "").replace("-", "")
                            if len(texto_placa) !=6: # Evitar falsos positivos de texto muy corto
                                continue
                            
                            
                            # Evitar registrar la misma placa repetidamente en segundos muy cercanos
 
                            if historial_detecciones and historial_detecciones[0]['placa'] == texto_placa:
                                # Si es la misma placa que acabamos de detectar hace un segundo, la ignoramos
                                continue
                            
                            
                            # 3. Convertir el frame con el cuadro verde a Base64 (Texto de imagen)
                            _, buffer = cv2.imencode('.jpg', frame)
                            img_base64 = base64.b64encode(buffer).decode('utf-8')
                            
                            # 4. Crear el registro de la detección
                            nueva_deteccion = {
                                "id": len(historial_detecciones) + 1,
                                "placa": texto_placa,
                                "hora": datetime.datetime.now().strftime("%H:%M:%S"),
                                "precision_ocr": round(prob * 100, 2), # En porcentaje (ej: 85.5%)
                                "precision_yolo": round(confianza_yolo * 100, 2),
                                "foto": f"data:image/jpeg;base64,{img_base64}" # Formato directo para React
                            }
                            
                            # Insertar al principio de la lista para que React vea primero lo más nuevo
                            historial_detecciones.insert(0, nueva_deteccion)
                            print(f"[NUEVA DETECCIÓN]: {texto_placa} - Precisión: {nueva_deteccion['precision_ocr']}%")

# Endpoint para que React consulte el historial de placas
@app.route('/api/detecciones')
def obtener_detecciones():
    return jsonify(historial_detecciones)

if __name__ == '__main__':
    # Hilo secundario (Threading): Permite que la cámara corra en un canal propio 
    # mientras Flask atiende las peticiones de React en otro canal.
    hilo_camara = threading.Thread(target=camara_vigilancia, daemon=True)
    hilo_camara.start()
    
    # Iniciar servidor Flask en el puerto 5000
    app.run(debug=False, port=5000)
"""
while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break

    # Filtramos desde la raíz para que r.plot() no dibuje basura
    results = model(frame, stream=True, conf=confianza_minima)

    for r in results:
        # Ahora annotated_frame solo tendrá cuadros con > 0.75 de confianza
        annotated_frame = r.plot()
        cv2.imshow("Sistema de Acceso", annotated_frame)

        for box in r.boxes:
            conf = box.conf[0]
            
            # Esta parte ya está filtrada, pero es bueno mantenerla
            print(f"\n ¡ACCESO CONCEDIDO! (Confianza: {conf:.2f})")
            
            cv2.imwrite("ultimo_acceso.jpg", frame)
            
            print("Acceso registrado. Presiona cualquier tecla para salir.")
            cv2.waitKey(0) 
            cap.release()
            cv2.destroyAllWindows()
            exit()

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break
cap.release()
cv2.destroyAllWindows()

"""