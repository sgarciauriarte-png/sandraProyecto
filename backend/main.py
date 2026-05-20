from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Body
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import cv2
import numpy as np
import asyncio
import base64
import threading
import queue
from pydantic import BaseModel
import os
from pathlib import Path
from contextlib import asynccontextmanager
from starlette.middleware.sessions import SessionMiddleware

# ===== RUTAS =====
BASE_DIR      = Path(__file__).resolve().parent.parent
STATIC_DIR    = BASE_DIR / "frontend" / "static"
TEMPLATES_DIR = BASE_DIR / "frontend" / "templates"

from database import get_db, User, EnergyConsumption, DailyConsumption
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, get_admin_user, ACCESS_TOKEN_EXPIRE_MINUTES,
    generate_reset_token
)
from mqtt_client import mqtt_client

# ===== CONFIGURACIÓN =====
# Tiempo sin detectar personas antes de apagar luces y AC
# Ajusta este valor según necesites:
# Pruebas:      1-2 minutos
# Uso real:     10-15 minutos
TIMEOUT_MINUTOS = 2
TIMEOUT_SECONDS = TIMEOUT_MINUTOS * 60

# ===== CARGAR YOLO NCNN =====
MODEL_PT_PATH   = BASE_DIR / "yolov8n.pt"
MODEL_NCNN_PATH = BASE_DIR / "yolov8n_ncnn_model"

def load_yolo_model():
    # Intentar cargar NCNN ya exportado
    if MODEL_NCNN_PATH.exists():
        try:
            from ultralytics import YOLO
            m = YOLO(str(MODEL_NCNN_PATH), task='detect')
            m(np.zeros((160, 160, 3), dtype=np.uint8), imgsz=160, verbose=False)
            print("✅ YOLO NCNN cargado")
            return m
        except Exception as e:
            print(f"⚠️ Error NCNN: {e}")

    # Descargar y exportar
    try:
        from ultralytics import YOLO
        if not MODEL_PT_PATH.exists():
            print("📥 Descargando yolov8n.pt...")
            from ultralytics.utils.downloads import safe_download
            safe_download(
                url='https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt',
                file=MODEL_PT_PATH, min_bytes=5_000_000
            )
        print("⏳ Exportando a NCNN (solo esta vez ~2 min)...")
        pt = YOLO(str(MODEL_PT_PATH))
        pt.export(format="ncnn", imgsz=160)
        generated = MODEL_PT_PATH.parent / "yolov8n_ncnn_model"
        if generated.exists():
            import shutil
            shutil.move(str(generated), str(MODEL_NCNN_PATH))
        m = YOLO(str(MODEL_NCNN_PATH), task='detect')
        print("✅ NCNN exportado y cargado")
        return m
    except Exception as e:
        print(f"❌ YOLO no disponible: {e}")
        return None

model = load_yolo_model()

# ===== ESTADO GLOBAL (mínimo necesario) =====
detection_active    = False
last_detection_time = None

# Queue WebSocket → MOG2/Flow (rápido, siempre activo)
_frame_queue_fast         = queue.Queue(maxsize=1)
# Queue WebSocket → YOLO (lento, descarta si está ocupado)
_frame_queue_yolo         = queue.Queue(maxsize=1)
# Queue workers → WebSocket (resultado final con frame anotado)
_result_queue             = queue.Queue(maxsize=1)
_detection_thread_running = False

# Estado compartido entre threads (protegido con lock)
_state_lock    = threading.Lock()
_yolo_detected = False
_people_count  = 0
_yolo_boxes    = []   # lista de (x1,y1,x2,y2,conf) del último frame YOLO


# ===== PYDANTIC =====
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str

class UserUpdate(BaseModel):
    email: str
    role: str
    is_active: bool

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str


# ===== WORKER DE DETECCIÓN =====
# ===== THREAD YOLO (lento, independiente) =====
def _yolo_worker():
    """Corre YOLO en su propio thread — nunca bloquea el video ni MOG2."""
    global _yolo_detected, _people_count

    if model is None:
        print("⚠️ YOLO no disponible — thread YOLO inactivo")
        return

    while _detection_thread_running:
        try:
            frame = _frame_queue_yolo.get(timeout=1.0)
        except queue.Empty:
            continue

        try:
            h, w = frame.shape[:2]
            results = model(frame, classes=[0], imgsz=160, conf=0.30, verbose=False)
            detected = False
            count    = 0
            boxes    = []

            # Escala entre imgsz=160 y el frame real (320x240)
            scale_x = w / 160.0
            scale_y = h / 160.0

            for r in results:
                for box in r.boxes:
                    conf_val = float(box.conf[0])
                    if conf_val < 0.30:
                        continue

                    # xyxy viene en coordenadas del imgsz=160
                    # hay que escalar al tamaño real del frame
                    x1 = int(box.xyxy[0][0] * scale_x)
                    y1 = int(box.xyxy[0][1] * scale_y)
                    x2 = int(box.xyxy[0][2] * scale_x)
                    y2 = int(box.xyxy[0][3] * scale_y)

                    bw = x2 - x1
                    bh = y2 - y1

                    # Filtros anti-falsos positivos
                    if bh < h * 0.08:      # objeto demasiado pequeño
                        continue
                    if bw > bh * 2.0:      # más ancho que alto → no es persona
                        continue

                    count   += 1
                    detected = True
                    boxes.append((x1, y1, x2, y2, conf_val))

            with _state_lock:
                _yolo_detected = detected
                _people_count  = count
                _yolo_boxes    = boxes
        except Exception as e:
            print(f"⚠️ YOLO error: {e}")


# ===== THREAD PRINCIPAL: MOG2 + Flow + display (rápido) =====
def _detection_worker():
    global detection_active, last_detection_time

    db_local = next(get_db())
    db_skip  = 0

    # MOG2
    bg_sub = cv2.createBackgroundSubtractorMOG2(
        history=500, varThreshold=25, detectShadows=False
    )
    MIN_MOTION_AREA = 1500
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    # Optical Flow
    prev_gray      = None
    FLOW_THRESHOLD = 0.3

    # Contador de frames para enviar a YOLO cada N frames
    yolo_frame_skip = 0

    while _detection_thread_running:
        try:
            frame = _frame_queue_fast.get(timeout=0.5)
        except queue.Empty:
            continue

        motion_mog2 = False
        motion_flow = False

        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # --- MOG2 (~1ms) ---
            fg = bg_sub.apply(frame)
            fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN,  kernel)
            fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel)
            motion_mog2 = cv2.countNonZero(fg) > MIN_MOTION_AREA

            # --- Optical Flow (~5ms) ---
            if prev_gray is not None:
                flow = cv2.calcOpticalFlowFarneback(
                    prev_gray, gray, None,
                    pyr_scale=0.5, levels=2, winsize=10,
                    iterations=2, poly_n=5, poly_sigma=1.1, flags=0
                )
                motion_flow = np.mean(
                    np.sqrt(flow[..., 0]**2 + flow[..., 1]**2)
                ) > FLOW_THRESHOLD
            prev_gray = gray

            # --- Enviar a YOLO cada 12 frames (no bloquea) ---
            yolo_frame_skip += 1
            if yolo_frame_skip >= 12:
                yolo_frame_skip = 0
                try: _frame_queue_yolo.put_nowait(frame.copy())
                except queue.Full: pass

            # Leer estado YOLO sin bloquear
            with _state_lock:
                yolo_det = _yolo_detected
                p_count  = _people_count
                boxes    = list(_yolo_boxes)

            # Dibujar bounding boxes del último resultado YOLO
            for (x1, y1, x2, y2, conf_val) in boxes:
                cv2.rectangle(frame, (x1,y1), (x2,y2), (0,200,80), 2)
                cv2.putText(frame, f"Persona {conf_val:.0%}",
                    (x1, max(y1-6, 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,200,80), 1)

            # --- HUD ---
            h, w = frame.shape[:2]
            roi = frame[0:56, 0:w]
            cv2.addWeighted(np.zeros_like(roi), 0.6, roi, 0.4, 0, roi)
            frame[0:56, 0:w] = roi

            def c(v): return (0, 220, 90) if v else (80, 80, 80)

            cv2.putText(frame,
                f"MOG2: {'DETECTA' if motion_mog2 else 'sin movimiento'}",
                (8, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.48, c(motion_mog2), 1)
            cv2.putText(frame,
                f"FLOW: {'DETECTA' if motion_flow else 'sin movimiento sutil'}",
                (8, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.48, c(motion_flow), 1)
            cv2.putText(frame,
                f"YOLO: {'DETECTA' if yolo_det else 'sin persona'}",
                (8, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.48, c(yolo_det), 1)
            cv2.putText(frame,
                f"Luces:{'ON' if mqtt_client.lights_on else 'OFF'} AC:{'ON' if mqtt_client.ac_on else 'OFF'}",
                (w-190, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0,200,255), 1)

            # --- LÓGICA MQTT ---
            # YOLO decide si hay personas (preciso, evita falsos positivos de MOG2/Flow)
            # MOG2+Flow extienden el timer si YOLO ya detectó presencia antes
            # Así: YOLO enciende, MOG2+Flow mantienen encendido mientras haya movimiento
            now = datetime.now()

            if yolo_det:
                # YOLO confirma persona → encender y resetear timer
                last_detection_time = now
                if not detection_active:
                    mqtt_client.publish_lights(True)
                    mqtt_client.publish_ac(True)
                    detection_active = True
                    print(f"💡 ON — YOLO detectó {p_count} persona(s)")

            elif detection_active and (motion_mog2 or motion_flow):
                # Ya estaban encendidas y hay movimiento → mantener timer activo
                # Esto evita apagado cuando personas están quietas pero se mueven un poco
                last_detection_time = now

            else:
                # Sin YOLO y sin movimiento → contar timeout para apagar
                if detection_active and last_detection_time:
                    elapsed = (now - last_detection_time).total_seconds()
                    mins    = max(0, (TIMEOUT_SECONDS - elapsed) / 60)

                    if elapsed >= TIMEOUT_SECONDS:
                        mqtt_client.publish_lights(False)
                        mqtt_client.publish_ac(False)
                        detection_active    = False
                        last_detection_time = None
                        print(f"💡 OFF — {TIMEOUT_MINUTOS} min sin personas")
                    else:
                        cv2.putText(frame,
                            f"Sin personas — apagando en {mins:.1f} min",
                            (8, h-8), cv2.FONT_HERSHEY_SIMPLEX,
                            0.45, (0,165,255), 1)

            # --- BD cada 6 frames ---
            db_skip += 1
            if db_skip >= 6:
                db_skip = 0
                power = (100.0 if mqtt_client.lights_on else 0.0) +                         (1500.0 if mqtt_client.ac_on    else 0.0)
                db_local.add(EnergyConsumption(
                    lights_on=mqtt_client.lights_on,
                    ac_on=mqtt_client.ac_on,
                    power_watts=power,
                    people_detected=p_count
                ))
                db_local.commit()

        except Exception as e:
            print(f"⚠️ Worker error: {e}")

        try:
            _result_queue.put_nowait((frame, p_count))
        except queue.Full:
            pass

    db_local.close()


# ===== LIFESPAN =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _detection_thread_running

    try:
        mqtt_client.connect()
        print("✅ MQTT conectado")
    except Exception as e:
        print(f"⚠️ MQTT: {e}")

    db = next(get_db())
    try:
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(
                username="admin", email="admin@oker.com",
                hashed_password=get_password_hash("admin123"), role="admin"
            ))
            db.commit()
            print("✅ Admin creado")
        else:
            print("✅ Admin existe")
    except Exception as e:
        print(f"⚠️ DB: {e}")
    finally:
        db.close()

    _detection_thread_running = True
    threading.Thread(target=_detection_worker, daemon=True, name="detector-fast").start()
    threading.Thread(target=_yolo_worker,      daemon=True, name="detector-yolo").start()
    print("✅ Workers iniciados (MOG2+Flow | YOLO independiente)")

    print(f"\n{'='*50}")
    print(f"✅ DomaticSec iniciado — http://localhost:8000")
    print(f"👤 admin / admin123")
    print(f"📹 YOLO: {'✅' if model else '❌ (MOG2+Flow activos)'}")
    print(f"{'='*50}\n")

    yield

    _detection_thread_running = False
    try: mqtt_client.disconnect()
    except: pass


# ===== APP =====
app = FastAPI(lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SECRET_KEY", "tu-clave-secreta")
)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ===== AUTENTICACIÓN =====

@app.post("/token", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"})
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuario inactivo")

    token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": token, "token_type": "bearer",
            "role": user.role, "username": user.username,
            "user_id": user.id, "email": user.email}


@app.post("/auth/forgot-password")
async def forgot_password(
    email: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"message": "Si el email existe, recibirás un enlace de recuperación"}
    reset_token = generate_reset_token()
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()
    link = f"{os.getenv('FRONTEND_URL','http://localhost:8000')}/reset-password?token={reset_token}"
    print(f"\n🔑 RESET: {link}\n")
    try:
        from email_service import send_password_reset_email
        if os.getenv('SMTP_USER') and os.getenv('SMTP_PASSWORD'):
            send_password_reset_email(email, reset_token, user.username)
    except: pass
    return {"message": "Si el email existe, recibirás un enlace de recuperación"}


@app.post("/auth/reset-password")
async def reset_password(
    token: str = Body(...),
    new_password: str = Body(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.reset_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido")
    if user.reset_token_expires and user.reset_token_expires < datetime.utcnow():
        user.reset_token = user.reset_token_expires = None
        db.commit()
        raise HTTPException(status_code=400, detail="Token expirado")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Mínimo 8 caracteres")
    user.hashed_password = get_password_hash(new_password)
    user.reset_token = user.reset_token_expires = None
    db.commit()
    return {"message": "Contraseña restablecida exitosamente"}


# ===== PÁGINAS =====
def read_template(f): 
    return open(TEMPLATES_DIR / f, encoding="utf-8").read()

@app.get("/",               response_class=HTMLResponse)
async def get_login():          return read_template("login.html")
@app.get("/dashboard",      response_class=HTMLResponse)
async def get_dashboard():      return read_template("dashboard.html")
@app.get("/users",          response_class=HTMLResponse)
async def get_users():          return read_template("users.html")
@app.get("/consumption",    response_class=HTMLResponse)
async def get_consumption():    return read_template("consumption.html")
@app.get("/reset-password", response_class=HTMLResponse)
async def get_reset_pw():       return read_template("reset-password.html")


# ===== API USUARIOS =====

@app.get("/api/users")
async def list_users(
    cu: User = Depends(get_admin_user), db: Session = Depends(get_db)
):
    return [{"id":u.id,"username":u.username,"email":u.email,
             "role":u.role,"is_active":u.is_active,
             "created_at":u.created_at.isoformat() if u.created_at else None}
            for u in db.query(User).all()]

@app.post("/api/users")
async def create_user(
    user: UserCreate,
    cu: User = Depends(get_admin_user), db: Session = Depends(get_db)
):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Usuario ya existe")
    u = User(username=user.username, email=user.email,
             hashed_password=get_password_hash(user.password), role=user.role)
    db.add(u); db.commit(); db.refresh(u)
    return {"message": "Usuario creado", "id": u.id}

@app.put("/api/users/{user_id}")
async def update_user(
    user_id: int, data: UserUpdate,
    cu: User = Depends(get_admin_user), db: Session = Depends(get_db)
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u: raise HTTPException(status_code=404, detail="No encontrado")
    u.email = data.email; u.role = data.role; u.is_active = data.is_active
    db.commit()
    return {"message": "Usuario actualizado"}

@app.delete("/api/users/{user_id}")
async def delete_user(
    user_id: int,
    cu: User = Depends(get_admin_user), db: Session = Depends(get_db)
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u: raise HTTPException(status_code=404, detail="No encontrado")
    if u.id == cu.id: raise HTTPException(status_code=400, detail="No puedes eliminarte")
    db.delete(u); db.commit()
    return {"message": "Usuario eliminado"}


# ===== WEBSOCKET CÁMARA =====

@app.websocket("/ws/camera")
async def websocket_camera(websocket: WebSocket):
    await websocket.accept()

    # Abrir cámara por ruta directa (más confiable en RPi con múltiples /dev/video*)
    cap = None
    for ruta in ["/dev/video0", "/dev/video1", 0, 1]:
        try:
            cap = cv2.VideoCapture(ruta)
            if cap.isOpened():
                ret, _ = cap.read()
                if ret:
                    print(f"📷 Cámara abierta: {ruta}")
                    break
            cap.release(); cap = None
        except Exception:
            cap = None

    if not cap:
        await websocket.send_json({"error": "No se pudo abrir la cámara"})
        await websocket.close()
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  320)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
    cap.set(cv2.CAP_PROP_FPS,          10)
    cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)

    import time; time.sleep(0.3)
    for _ in range(3): cap.read()  # descartar frames inestables

    frame_count = 0
    last_result = (None, 0)

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                await asyncio.sleep(0.05)
                continue

            frame_count += 1

            # Enviar al worker rápido cada 4 frames (MOG2+Flow)
            if frame_count % 4 == 0:
                try: _frame_queue_fast.put_nowait(frame.copy())
                except queue.Full: pass

            try: last_result = _result_queue.get_nowait()
            except queue.Empty: pass

            display, people = last_result
            display = display if display is not None else frame

            _, buf = cv2.imencode('.jpg', display, [cv2.IMWRITE_JPEG_QUALITY, 45])

            await websocket.send_json({
                "frame":   base64.b64encode(buf).decode(),
                "people":  people,
                "lights":  mqtt_client.lights_on,
                "ac":      mqtt_client.ac_on,
            })

            await asyncio.sleep(0.066)

    except WebSocketDisconnect:
        pass
    finally:
        cap.release()


# ===== API CONSUMO =====

@app.get("/api/consumption/realtime")
async def realtime(cu: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        data = db.query(EnergyConsumption)\
                 .order_by(EnergyConsumption.timestamp.desc()).limit(60).all()
        return [{"timestamp": d.timestamp.isoformat(),
                 "power": float(d.power_watts),
                 "people": int(d.people_detected)} for d in reversed(data)]
    except: return []

@app.get("/api/consumption/daily")
async def daily(cu: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func
    from datetime import timezone
    try:
        end   = datetime.now(timezone.utc)
        start = end - timedelta(days=7)
        rows  = (db.query(
                    func.date(EnergyConsumption.timestamp).label('date'),
                    func.sum(EnergyConsumption.power_watts).label('tw'),
                    func.count(EnergyConsumption.id).label('n'))
                 .filter(EnergyConsumption.timestamp >= start)
                 .group_by(func.date(EnergyConsumption.timestamp))
                 .order_by(func.date(EnergyConsumption.timestamp)).all())
        return [{"date": str(r.date),
                 "kwh": round((r.tw * r.n) / 1000 / 360, 2) if r.tw else 0,
                 "hours_lights": 0, "hours_ac": 0} for r in rows]
    except: return []

@app.get("/api/consumption/monthly")
async def monthly(cu: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func
    try:
        rows = (db.query(
                    func.strftime('%Y-%m', EnergyConsumption.timestamp).label('month'),
                    func.sum(EnergyConsumption.power_watts).label('tw'),
                    func.count(EnergyConsumption.id).label('n'))
                .group_by(func.strftime('%Y-%m', EnergyConsumption.timestamp))
                .order_by(func.strftime('%Y-%m', EnergyConsumption.timestamp).desc())
                .limit(12).all())
        return list(reversed([{
            "month": r.month or datetime.now().strftime('%Y-%m'),
            "kwh": round((r.tw * r.n) / 1000 / 360, 2) if r.tw else 0
        } for r in rows]))
    except: return []

@app.get("/api/status")
async def get_status():
    return {
        "status":           "ok",
        "model_loaded":     model is not None,
        "lights_on":        mqtt_client.lights_on,
        "ac_on":            mqtt_client.ac_on,
        "detection_active": detection_active,
    }


# ===== ENTRY POINT =====
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info", workers=1)