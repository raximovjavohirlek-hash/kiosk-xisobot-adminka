import os
import sys
import io
import json
import sqlite3
import pytest

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app, issue_token, get_database_path
from database import (
    get_db_connection,
    init_db,
    batch_upsert_tickets,
    rebuild_aggregates_from_tickets,
    create_database_backup,
    get_database_health,
    get_database_consistency_report,
    save_station_override,
    get_station_overrides
)


@pytest.fixture
def temp_db(tmp_path):
    """Creates a temporary isolated SQLite database with initial schema."""
    db_file = str(tmp_path / "temp_kiosk_data.db")
    init_db(db_file)
    return db_file


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def test_get_db_connection_pragmas(temp_db):
    """Verify that connection applies WAL, Foreign Keys, and Busy Timeout."""
    conn = get_db_connection(temp_db)
    cur = conn.cursor()

    cur.execute("PRAGMA journal_mode;")
    journal_mode = cur.fetchone()[0]
    assert journal_mode.lower() == 'wal'

    cur.execute("PRAGMA foreign_keys;")
    foreign_keys = cur.fetchone()[0]
    assert foreign_keys == 1

    cur.execute("PRAGMA busy_timeout;")
    busy_timeout = cur.fetchone()[0]
    assert busy_timeout >= 30000

    conn.close()


def test_database_init_idempotent_no_data_loss(temp_db):
    """Verify that repeatedly running init_db preserves existing data and tables."""
    # Insert sample ticket
    sample_tickets = [{
        'ticket_number': 'TEST_TICK_001',
        'order_id': 'ORD_001',
        'date_str': '15.09.2026',
        'ym': '2026-09',
        'user_email': 'samarqandkiosk@railway.uz',
        'station_name': 'Самарқанд',
        'payment_type': 'Terminal',
        'payment_method': 'Uzcard Terminal',
        'qty': 1,
        'summa': 120000.0,
        'status': 'ACTIVE'
    }]
    res = batch_upsert_tickets(temp_db, sample_tickets)
    assert res['inserted'] == 1

    # Re-run init_db multiple times
    init_db(temp_db)
    init_db(temp_db)

    # Verify ticket was not deleted or reset
    conn = get_db_connection(temp_db)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tickets WHERE ticket_number = 'TEST_TICK_001';")
    assert cur.fetchone()[0] == 1
    conn.close()


def test_duplicate_ticket_prevention(temp_db):
    """Verify that duplicate ticket numbers are ignored via database PRIMARY KEY."""
    ticket = {
        'ticket_number': 'UNIQUE_TICK_999',
        'order_id': 'ORD_999',
        'date_str': '16.09.2026',
        'ym': '2026-09',
        'user_email': 'buxorokiosk@railway.uz',
        'station_name': 'Бухоро',
        'payment_type': 'Terminal',
        'qty': 1,
        'summa': 85000.0
    }

    # First insert
    res1 = batch_upsert_tickets(temp_db, [ticket])
    assert res1['inserted'] == 1
    assert res1['skipped'] == 0

    # Second insert with identical ticket_number
    res2 = batch_upsert_tickets(temp_db, [ticket])
    assert res2['inserted'] == 0
    assert res2['skipped'] == 1

    # Verify count is still exactly 1
    conn = get_db_connection(temp_db)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tickets WHERE ticket_number = 'UNIQUE_TICK_999';")
    assert cur.fetchone()[0] == 1
    conn.close()


def test_station_overrides_preserved_across_rebuilds(temp_db):
    """Verify that station overrides are never lost when aggregates are rebuilt."""
    email_map = {
        'samarqandkiosk@railway.uz': {'station': 'Самарқанд'}
    }
    # Save an override
    save_station_override(
        temp_db,
        ym='2026-09',
        email='samarqandkiosk@railway.uz',
        override_tickets=500,
        override_summa=150000000.0,
        day_str='ALL',
        email_map=email_map
    )

    # Verify override was saved
    overrides = get_station_overrides(temp_db)
    assert len(overrides) == 1
    assert overrides[0]['override_tickets'] == 500

    # Trigger aggregate rebuild
    rebuild_aggregates_from_tickets(temp_db, email_map)

    # Verify override is still in station_overrides table
    overrides_after = get_station_overrides(temp_db)
    assert len(overrides_after) == 1
    assert overrides_after[0]['override_tickets'] == 500


def test_create_database_backup_and_integrity(temp_db, tmp_path):
    """Verify online backup creation and backup PRAGMA integrity check."""
    backup_dir = str(tmp_path / "backups")
    backup_file = create_database_backup(temp_db, backup_dir=backup_dir)

    assert os.path.exists(backup_file)
    assert os.path.getsize(backup_file) > 0

    # Verify backup is a valid SQLite DB
    conn = sqlite3.connect(backup_file)
    cur = conn.cursor()
    cur.execute("PRAGMA integrity_check;")
    assert cur.fetchone()[0] == 'ok'
    conn.close()


def test_database_health_diagnostic(temp_db):
    """Verify get_database_health returns complete diagnostic metadata."""
    health = get_database_health(temp_db)

    assert health['exists'] is True
    assert health['status'] == 'healthy'
    assert health['integrity_status'] == 'ok'
    assert health['journal_mode'].lower() == 'wal'
    assert 'tickets' in health['table_counts']
    assert 'monthly_summaries' in health['table_counts']
    assert 'daily_stats' in health['table_counts']


def test_database_consistency_report(temp_db):
    """Verify get_database_consistency_report audits critical anomalies without modifying data."""
    email_map = {'andijonkiosk@railway.uz': {'station': 'Андижон'}}
    report = get_database_consistency_report(temp_db, email_map)

    assert report['status'] == 'success'
    assert report['is_consistent'] is True
    assert report['duplicate_tickets_count'] == 0
    assert report['negative_amounts_count'] == 0


def test_get_database_path_resolution(monkeypatch, tmp_path):
    """Verify get_database_path precedence: DATABASE_PATH > DATA_DIR > default."""
    custom_db = str(tmp_path / "custom.db")
    custom_dir = str(tmp_path / "dir")

    # 1. DATABASE_PATH takes highest priority
    monkeypatch.setenv('DATABASE_PATH', custom_db)
    monkeypatch.setenv('DATA_DIR', custom_dir)
    assert get_database_path() == os.path.abspath(custom_db)

    # 2. DATA_DIR used if DATABASE_PATH not set
    monkeypatch.delenv('DATABASE_PATH')
    assert get_database_path() == os.path.abspath(os.path.join(custom_dir, 'kiosk_data.db'))


def test_api_admin_db_health_and_consistency(client):
    """Verify admin endpoints /api/admin/db-health and /api/admin/db-consistency."""
    token = issue_token('Javohir', 'admin')
    headers = {'Authorization': f'Bearer {token}'}

    # Health
    res_health = client.get('/api/admin/db-health', headers=headers)
    assert res_health.status_code == 200
    data_health = res_health.get_json()
    assert data_health['success'] is True
    assert data_health['health']['status'] in ('healthy', 'warning')

    # Consistency
    res_cons = client.get('/api/admin/db-consistency', headers=headers)
    assert res_cons.status_code == 200
    data_cons = res_cons.get_json()
    assert data_cons['success'] is True
    assert 'is_consistent' in data_cons['consistency_report']


def test_api_restore_db_rejects_corrupted_file(client, tmp_path):
    """Verify /api/admin/restore-db rejects non-sqlite or corrupted uploads."""
    token = issue_token('Javohir', 'admin')
    headers = {'Authorization': f'Bearer {token}'}

    corrupted_data = io.BytesIO(b"THIS IS NOT A VALID SQLITE DATABASE FILE")
    res = client.post(
        '/api/admin/restore-db',
        headers=headers,
        data={'file': (corrupted_data, 'fake_database.db')}
    )
    assert res.status_code == 400
    assert "SQLite ma'lumotlar bazasi emas" in res.get_json()['error']
