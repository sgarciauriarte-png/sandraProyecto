from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

# ==================== CONFIGURACIÓN SQLITE ====================
SQLALCHEMY_DATABASE_URL = "sqlite:///./oker.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ==================== MODELOS ====================
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    reset_token = Column(String(100), nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)

class EnergyConsumption(Base):
    __tablename__ = "energy_consumption"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    lights_on = Column(Boolean, default=False, nullable=False)
    ac_on = Column(Boolean, default=False, nullable=False)
    power_watts = Column(Float, default=0.0, nullable=False)
    people_detected = Column(Integer, default=0, nullable=False)

class DailyConsumption(Base):
    __tablename__ = "daily_consumption"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, unique=True, nullable=False, index=True)
    total_kwh = Column(Float, default=0.0, nullable=False)
    hours_lights_on = Column(Float, default=0.0, nullable=False)
    hours_ac_on = Column(Float, default=0.0, nullable=False)

class DeviceLog(Base):
    __tablename__ = "device_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    device_type = Column(String(20), nullable=False)
    action = Column(String(10), nullable=False)
    people_count = Column(Integer, default=0)
    reason = Column(String(100), nullable=True)

# ==================== FUNCIONES ====================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_database():
    try:
        print("🔄 Creando base de datos SQLite...")
        Base.metadata.create_all(bind=engine)
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        print(f"✅ Base de datos inicializada: {', '.join(tables)}")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

# Inicializar al importar
if __name__ == "__main__":
    init_database()
