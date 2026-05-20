from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db, User
import secrets
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "tu-clave-secreta-super-segura")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verificar contraseña con bcrypt"""
    try:
        if isinstance(plain_password, str):
            plain_password = plain_password.encode('utf-8')
        if isinstance(hashed_password, str):
            hashed_password = hashed_password.encode('utf-8')
        
        return bcrypt.checkpw(plain_password, hashed_password)
    except Exception as e:
        print(f"Error verificando contraseña: {e}")
        return False

def get_password_hash(password: str) -> str:
    """Generar hash de contraseña con bcrypt"""
    try:
        if isinstance(password, str):
            password = password.encode('utf-8')
        
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password, salt)
        
        return hashed.decode('utf-8')
    except Exception as e:
        print(f"Error generando hash: {e}")
        raise

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def generate_reset_token() -> str:
    """Generar token seguro para reseteo de contraseña"""
    return secrets.token_urlsafe(32)

def generate_verification_token() -> str:
    """Generar token de verificación"""
    return secrets.token_urlsafe(32)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

def get_admin_user(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="No tienes permisos de administrador")
    return current_user

def create_user_from_oauth(
    db: Session,
    email: str,
    username: str,
    oauth_provider: str,
    oauth_id: str,
    profile_picture: Optional[str] = None
) -> User:
    """Crear usuario desde OAuth (Google/Facebook)"""
    user = User(
        username=username,
        email=email,
        hashed_password=None,  # No tiene contraseña
        role="controller",  # Por defecto controlador
        oauth_provider=oauth_provider,
        oauth_id=oauth_id,
        profile_picture=profile_picture,
        email_verified=True,  # OAuth ya verifica el email
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user