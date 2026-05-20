import paho.mqtt.client as mqtt
import json
from datetime import datetime

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
TOPIC_LIGHTS = "oker/lights"
TOPIC_AC = "oker/ac"

class MQTTClient:
    def __init__(self):
        self.client = mqtt.Client()
        self.lights_on = False
        self.ac_on = False
        
    def connect(self):
        self.client.connect(MQTT_BROKER, MQTT_PORT, 60)
        self.client.loop_start()
    
    def publish_lights(self, state: bool):
        self.lights_on = state
        message = {"state": "on" if state else "off", "timestamp": str(datetime.now())}
        self.client.publish(TOPIC_LIGHTS, json.dumps(message))
    
    def publish_ac(self, state: bool):
        self.ac_on = state
        message = {"state": "on" if state else "off", "timestamp": str(datetime.now())}
        self.client.publish(TOPIC_AC, json.dumps(message))
    
    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()

mqtt_client = MQTTClient()