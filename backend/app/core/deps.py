from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db

_bearer = HTTPBearer(auto_error=False)


async def get_db_session() -> AsyncSession:
    """Alias para dependência de sessão de banco."""
    async for session in get_db():
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Resolve o usuário atual a partir do Bearer JWT."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token ausente",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from app.api.v1.auth import decode_token
    user_id = decode_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from app.models.admin_user import AdminUser
    result = await db.execute(select(AdminUser).where(AdminUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado ou inativo",
        )

    return {
        "id": user.id,
        "username": user.username,
        "is_superuser": user.is_superuser,
    }


def require_admin(
    current_user: dict = Depends(get_current_user),
) -> dict:
    if not current_user.get("is_superuser"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão de administrador necessária",
        )
    return current_user
