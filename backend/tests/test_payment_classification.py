import pytest
import sqlite3
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from database import resolve_payment_info, init_db, batch_upsert_tickets, rebuild_aggregates_from_tickets

def test_resolve_payment_info():
    # 1. Uzcard Terminal
    p_uz = resolve_payment_info('Uzcard')
    assert p_uz['type'] == 'Terminal'
    assert 'Uzcard' in p_uz['method']

    # 2. Humo Terminal (Uzkassa)
    p_humo = resolve_payment_info('Uzkassa')
    assert p_humo['type'] == 'Terminal'
    assert 'Humo' in p_humo['method']

    # 3. Online agents (card + SMS confirmation)
    online_cases = ['HamkorbankHold', 'HamkorbankWebView', 'Payme', 'StripeIntegration', 'OctoBankFC', 'Click', 'Uzum']
    for agent in online_cases:
        p_on = resolve_payment_info(agent)
        assert p_on['type'] == 'Online', f"Expected {agent} to be Online, got {p_on['type']}"

    # 4. Sorbon Kassa
    p_kassa = resolve_payment_info('Kassa')
    assert 'Kassa' in p_kassa['type']
    p_sorbon = resolve_payment_info('Sorbon')
    assert 'Kassa' in p_sorbon['type']

def test_database_payment_aggregation(tmp_path):
    test_db = str(tmp_path / "test_kiosk.db")
    init_db(test_db)

    email_map = {
        "samarqandkiosk@railway.uz": {"station": "Самарқанд"},
        "toshkent.shimoliykiosk@railway.uz": {"station": "Тошкент Марказий"}
    }

    tickets = [
        # Samarqand: 2 Uzcard (Terminal), 1 Humo (Terminal), 2 Hamkorbank (Online)
        {"ticket_number": "T1", "date_str": "01.09.2026", "ym": "2026-09", "user_email": "samarqandkiosk@railway.uz", "station_name": "Самарқанд", "payment_method": "Uzcard", "qty": 1, "summa": 100000},
        {"ticket_number": "T2", "date_str": "01.09.2026", "ym": "2026-09", "user_email": "samarqandkiosk@railway.uz", "station_name": "Самарқанд", "payment_method": "Uzcard", "qty": 1, "summa": 100000},
        {"ticket_number": "T3", "date_str": "01.09.2026", "ym": "2026-09", "user_email": "samarqandkiosk@railway.uz", "station_name": "Самарқанд", "payment_method": "Uzkassa", "qty": 1, "summa": 150000},
        {"ticket_number": "T4", "date_str": "01.09.2026", "ym": "2026-09", "user_email": "samarqandkiosk@railway.uz", "station_name": "Самарқанд", "payment_method": "HamkorbankHold", "qty": 1, "summa": 200000},
        {"ticket_number": "T5", "date_str": "01.09.2026", "ym": "2026-09", "user_email": "samarqandkiosk@railway.uz", "station_name": "Самарқанд", "payment_method": "Payme", "qty": 1, "summa": 250000},
    ]

    res = batch_upsert_tickets(test_db, tickets)
    assert res['inserted'] == 5

    rebuild_aggregates_from_tickets(test_db, email_map)

    conn = sqlite3.connect(test_db)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM daily_stats WHERE ym = '2026-09' AND date_str = '01.09.2026'")
    row = dict(c.fetchone())

    assert row['total_tickets'] == 5
    assert row['total_summa'] == 800000.0
    assert row['online_tickets'] == 2
    assert row['online_summa'] == 450000.0
    assert row['terminal_tickets'] == 3
    assert row['terminal_summa'] == 350000.0
    assert row['uzcard_tickets'] == 2
    assert row['uzcard_summa'] == 200000.0
    assert row['humo_tickets'] == 1
    assert row['humo_summa'] == 150000.0

    conn.close()
