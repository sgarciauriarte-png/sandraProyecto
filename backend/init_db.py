"""
Script para inicializar la base de datos MySQL
"""
from database import init_database, SessionLocal, User
from auth import get_password_hash
import sys

def create_admin_user():
    """Crear usuario administrador por defecto"""
    db = SessionLocal()
    try:
        # Verificar si existe
        admin = db.query(User).filter(User.username == "admin").first()
        
        if admin:
            print("⚠️ Usuario admin ya existe")
            respuesta = input("¿Deseas recrearlo? (s/n): ")
            if respuesta.lower() != 's':
                return
            db.delete(admin)
            db.commit()
            print("✅ Usuario admin anterior eliminado")
        
        # Crear nuevo admin
        admin = User(
            username="admin",
            email="admin@oker.com",
            hashed_password=get_password_hash("admin123"),
            role="admin",
            is_active=True
        )
        db.add(admin)
        db.commit()
        
        print("\n" + "="*60)
        print("✅ Usuario administrador creado exitosamente")
        print("="*60)
        print(f"👤 Usuario: admin")
        print(f"🔑 Contraseña: admin123")
        print(f"📧 Email: admin@oker.com")
        print(f"🎭 Rol: Administrador")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"❌ Error creando usuario admin: {e}")
        db.rollback()
    finally:
        db.close()

def create_sample_data():
    """Crear datos de ejemplo"""
    db = SessionLocal()
    try:
        from database import EnergyConsumption, DeviceLog
        from datetime import datetime, timedelta
        
        print("🔄 Creando datos de ejemplo...")
        
        # Crear algunos registros de consumo de los últimos 7 días
        for i in range(100):
            timestamp = datetime.now() - timedelta(hours=i)
            consumption = EnergyConsumption(
                timestamp=timestamp,
                lights_on=(i % 3 == 0),
                ac_on=(i % 5 == 0),
                power_watts=100.0 if (i % 3 == 0) else 0.0 + 1500.0 if (i % 5 == 0) else 0.0,
                people_detected=(i % 4)
            )
            db.add(consumption)
        
        db.commit()
        print("✅ Datos de ejemplo creados")
        
    except Exception as e:
        print(f"⚠️ Error creando datos de ejemplo: {e}")
        db.rollback()
    finally:
        db.close()

def main():
    """Menú principal"""
    print("\n" + "="*60)
    print("  INICIALIZACIÓN DE BASE DE DATOS OKER - MySQL")
    print("="*60)
    print("\nOpciones:")
    print("1. Inicializar base de datos (crear tablas)")
    print("2. Reiniciar base de datos (ELIMINA TODO)")
    print("3. Crear usuario admin")
    print("4. Crear datos de ejemplo")
    print("5. Todo lo anterior (inicializar completo)")
    print("0. Salir")
    print("="*60)
    
    opcion = input("\nSelecciona una opción: ")
    
    if opcion == "1":
        init_database()
    elif opcion == "2":
        confirmacion = input("⚠️ Esto eliminará TODOS los datos. ¿Continuar? (escribe 'SI'): ")
        if confirmacion == "SI":
            reset_database()
        else:
            print("❌ Operación cancelada")
    elif opcion == "3":
        create_admin_user()
    elif opcion == "4":
        create_sample_data()
    elif opcion == "5":
        if init_database():
            create_admin_user()
            respuesta = input("\n¿Deseas crear datos de ejemplo? (s/n): ")
            if respuesta.lower() == 's':
                create_sample_data()
    elif opcion == "0":
        print("👋 Saliendo...")
        sys.exit(0)
    else:
        print("❌ Opción inválida")

if __name__ == "__main__":
    main()