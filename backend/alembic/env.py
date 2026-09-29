from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
import sys
from pathlib import Path
# Add the project root to the path
project_root = str(Path(__file__).parent.parent.parent)
if project_root not in sys.path:
    sys.path.insert(0, project_root)
# Add the backend directory to the path
backend_path = str(Path(__file__).parent.parent)
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)
# Now import
from app.core.database.session import Base
target_metadata = Base.metadata