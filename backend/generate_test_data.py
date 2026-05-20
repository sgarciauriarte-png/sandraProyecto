"""
Script para generar datos de prueba de consumo energético
"""
from database import SessionLocal, EnergyConsumption
from datetime import datetime, timedelta, timezone
import random

def generate_test_data():
    db = SessionLocal()
    
    print("🔄 Generando datos de prueba...")
    
    try:
        # Eliminar datos antiguos (opcional)
        # db.query(EnergyConsumption).delete()
        # db.commit()
        # print("✅ Datos anteriores eliminados")
        
        # Generar datos de los últimos 30 días
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=30)
        
        current_date = start_date
        records_created = 0
        
        while current_date <= end_date:
            # Simular 24 horas (1 registro cada 10 minutos = 144 registros por día)
            for i in range(144):
                # Simular horario de oficina (8am - 6pm) con más actividad
                hour = current_date.hour
                is_work_hours = 8 <= hour <= 18
                
                # Probabilidad de personas detectadas
                if is_work_hours:
                    people = random.choice([0, 0, 1, 1, 2, 2, 3, 3, 4, 5])
                else:
                    people = random.choice([0, 0, 0, 0, 0, 1])
                
                # Luces y AC basado en personas
                lights_on = people > 0
                ac_on = people > 2
                
                # Calcular potencia
                power = 0.0
                if lights_on:
                    power += 100.0
                if ac_on:
                    power += 1500.0
                
                # Agregar variación aleatoria
                if power > 0:
                    power += random.uniform(-50, 50)
                
                # Crear registro
                consumption = EnergyConsumption(
                    timestamp=current_date,
                    lights_on=lights_on,
                    ac_on=ac_on,
                    power_watts=max(0, power),
                    people_detected=people
                )
                db.add(consumption)
                records_created += 1
                
                # Avanzar 10 minutos
                current_date += timedelta(minutes=10)
            
            # Commit cada día
            if records_created % 144 == 0:
                db.commit()
                print(f"✅ Día {(records_created // 144)} procesado ({records_created} registros)")
        
        db.commit()
        print(f"\n✅ {records_created} registros de prueba generados exitosamente")
        
        # Mostrar estadísticas
        total_records = db.query(EnergyConsumption).count()
        print(f"📊 Total de registros en base de datos: {total_records}")
        
        # Fechas de datos
        first = db.query(EnergyConsumption).order_by(EnergyConsumption.timestamp).first()
        last = db.query(EnergyConsumption).order_by(EnergyConsumption.timestamp.desc()).first()
        
        if first and last:
            print(f"📅 Rango de fechas: {first.timestamp} a {last.timestamp}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  GENERADOR DE DATOS DE PRUEBA - OKER")
    print("="*60 + "\n")
    
    respuesta = input("¿Generar datos de prueba para los últimos 30 días? (s/n): ")
    
    if respuesta.lower() == 's':
        generate_test_data()
    else:
        print("❌ Operación cancelada")