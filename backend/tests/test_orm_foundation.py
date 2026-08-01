"""Unit tests for ORM base, mixins, and UUIDv7 helpers."""

from __future__ import annotations

import uuid

from app.core.base import NAMING_CONVENTION, Base
from app.core.ids import new_uuid7
from app.core.mixins import SoftDeleteMixin, TimestampMixin, UuidPrimaryKeyMixin
from sqlalchemy import DateTime, MetaData, Uuid, inspect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class _TestBase(DeclarativeBase):
    """Isolated base so unit tests do not pollute app ``Base.metadata``."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class _ExampleEntity(
    UuidPrimaryKeyMixin,
    TimestampMixin,
    SoftDeleteMixin,
    _TestBase,
):
    """Ephemeral model for mixin assertions (not migrated)."""

    __tablename__ = 'example_entities'

    label: Mapped[str] = mapped_column()


class _HardDeleteOnly(UuidPrimaryKeyMixin, TimestampMixin, _TestBase):
    __tablename__ = 'hard_delete_only'


def test_new_uuid7_is_version_7() -> None:
    value = new_uuid7()
    assert isinstance(value, uuid.UUID)
    assert value.version == 7


def test_uuid7_values_are_unique() -> None:
    assert new_uuid7() != new_uuid7()


def test_naming_convention_keys() -> None:
    assert set(NAMING_CONVENTION) == {'ix', 'uq', 'ck', 'fk', 'pk'}
    assert Base.metadata.naming_convention == NAMING_CONVENTION


def test_mixin_columns_present() -> None:
    columns = {column.key: column for column in inspect(_ExampleEntity).columns}

    assert isinstance(columns['id'].type, Uuid)
    assert columns['id'].primary_key is True
    assert columns['id'].default is not None
    assert callable(columns['id'].default.arg)

    assert isinstance(columns['created_at'].type, DateTime)
    assert columns['created_at'].type.timezone is True
    assert isinstance(columns['updated_at'].type, DateTime)
    assert columns['updated_at'].type.timezone is True

    assert isinstance(columns['deleted_at'].type, DateTime)
    assert columns['deleted_at'].nullable is True


def test_soft_delete_mixin_is_opt_in() -> None:
    keys = {column.key for column in inspect(_HardDeleteOnly).columns}
    assert 'deleted_at' not in keys
    assert {'id', 'created_at', 'updated_at'} <= keys


def test_uuid_pk_default_callable_returns_uuid7() -> None:
    columns = {column.key: column for column in inspect(_ExampleEntity).columns}
    generated = columns['id'].default.arg(None)
    assert isinstance(generated, uuid.UUID)
    assert generated.version == 7
