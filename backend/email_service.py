import emails
import os
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
FROM_EMAIL = os.getenv("FROM_EMAIL")
FROM_NAME = os.getenv("FROM_NAME", "OKER Sistema")

def send_email(to_email: str, subject: str, html_content: str):
    """Enviar email usando SMTP"""
    try:
        message = emails.Message(
            subject=subject,
            html=html_content,
            mail_from=(FROM_NAME, FROM_EMAIL)
        )
        
        response = message.send(
            to=to_email,
            smtp={
                'host': SMTP_HOST,
                'port': SMTP_PORT,
                'timeout': 5,
                'user': SMTP_USER,
                'password': SMTP_PASSWORD,
                'tls': True
            }
        )
        
        return response.status_code == 250
    except Exception as e:
        print(f"Error enviando email: {e}")
        return False


def send_password_reset_email(email: str, token: str, username: str):
    """Enviar email de recuperación de contraseña"""
    reset_link = f"{os.getenv('FRONTEND_URL')}/reset-password?token={token}"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 40px;
                margin: 0;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: white;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }}
            .header {{
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 40px;
                text-align: center;
            }}
            .header h1 {{
                color: white;
                margin: 0;
                font-size: 2.5em;
            }}
            .content {{
                padding: 40px;
            }}
            .content h2 {{
                color: #333;
                margin-top: 0;
            }}
            .content p {{
                color: #666;
                line-height: 1.6;
            }}
            .button {{
                display: inline-block;
                padding: 15px 30px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
            }}
            .footer {{
                background: #f5f5f5;
                padding: 20px;
                text-align: center;
                color: #999;
                font-size: 0.9em;
            }}
            .warning {{
                background: #fff3cd;
                border-left: 4px solid #ffc107;
                padding: 15px;
                margin: 20px 0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 OKER</h1>
            </div>
            <div class="content">
                <h2>Hola {username},</h2>
                <p>Recibimos una solicitud para restablecer tu contraseña.</p>
                <p>Haz clic en el siguiente botón para crear una nueva contraseña:</p>
                
                <center>
                    <a href="{reset_link}" class="button">Restablecer Contraseña</a>
                </center>
                
                <div class="warning">
                    <strong>⚠️ Importante:</strong> Este enlace expirará en 1 hora.
                </div>
                
                <p>Si no solicitaste restablecer tu contraseña, ignora este correo.</p>
                <p>Por seguridad, nunca compartas este enlace con nadie.</p>
                
                <p style="margin-top: 30px; color: #999; font-size: 0.9em;">
                    Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                    <code>{reset_link}</code>
                </p>
            </div>
            <div class="footer">
                <p>© 2024 OKER - Sistema de Control de Energía</p>
                <p>Este es un correo automático, por favor no respondas.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(email, "🔐 Recuperación de Contraseña - OKER", html)