import sys
import torch
from pathlib import Path

# Agregar clases seguras
try:
    from ultralytics.nn.tasks import DetectionModel, SegmentationModel, ClassificationModel
    torch.serialization.add_safe_globals([
        DetectionModel,
        SegmentationModel, 
        ClassificationModel
    ])
    print("✅ Clases YOLO agregadas a safe_globals")
except Exception as e:
    print(f"⚠️ Error agregando safe_globals: {e}")

# Descargar y verificar modelo
try:
    from ultralytics import YOLO
    
    print("Descargando/Verificando modelo YOLOv8...")
    model = YOLO('yolov8n.pt')
    print("✅ Modelo descargado correctamente")
    
    # Probar predicción
    print("Probando modelo...")
    import numpy as np
    test_img = np.zeros((640, 640, 3), dtype=np.uint8)
    results = model(test_img, verbose=False)
    print("✅ Modelo funcionando correctamente")
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)