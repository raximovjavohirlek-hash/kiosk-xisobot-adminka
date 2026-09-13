import os
import sys
import json

import pytest
from werkzeug.security import generate_password_hash

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module
import database


@pytest.fixture
def users_file(tmp_path, monkeypatch):
    path = tmp_path / "users.json"
    users = [
        {
            "username": "Javohir",
            "password": generate_password_hash("RealAdminPass1!", method="pbkdf2:sha256"),
            "name": "Bosh Administrator",
            "role": "admin",
            "created_at": "2026-01-01 00:00:00",
        },
        {
            "username": "samarqand_user",
            "password": generate_password_hash("SamPass1!", method="pbkdf2:sha256"),
            "name": "Samarqand Kassir",
            "role": "user",
            "region": "samarqandkiosk@railway.uz",
            "created_at": "2026-01-01 00:00:00",
        },
    ]
    path.write_text(json.dumps(users), encoding="utf-8")
    monkeypatch.setattr(app_module, "USERS_FILE", str(path))
    monkeypatch.setattr(app_module, "LOGIN_ATTEMPTS", {})
    return path


@pytest.fixture
def client(users_file):
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


def test_login_rejects_old_hardcoded_backdoor_password(client):
    resp = client.post("/api/auth/login", json={"username": "javohir", "password": "javo!qaz"})
    assert resp.status_code == 401
    assert resp.get_json()["success"] is False


def test_login_rejects_wrong_password(client):
    resp = client.post("/api/auth/login", json={"username": "Javohir", "password": "wrong"})
    assert resp.status_code == 401


def test_login_succeeds_with_real_password_and_embeds_region(client):
    resp = client.post("/api/auth/login", json={"username": "samarqand_user", "password": "SamPass1!"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert data["user"]["region"] == "samarqandkiosk@railway.uz"

    decoded = app_module.verify_token(data["token"])
    assert decoded["region"] == "samarqandkiosk@railway.uz"
    assert decoded["role"] == "user"


def test_admin_login_has_no_region(client):
    resp = client.post("/api/auth/login", json={"username": "Javohir", "password": "RealAdminPass1!"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["user"]["region"] is None
    decoded = app_module.verify_token(data["token"])
    assert decoded["region"] is None


def test_login_lockout_after_five_failed_attempts(client):
    for _ in range(5):
        resp = client.post("/api/auth/login", json={"username": "samarqand_user", "password": "wrong"})
        assert resp.status_code == 401

    resp = client.post("/api/auth/login", json={"username": "samarqand_user", "password": "SamPass1!"})
    assert resp.status_code == 429
    data = resp.get_json()
    assert data["success"] is False


def test_get_auth_region_none_for_admin():
    with app_module.app.test_request_context():
        app_module.request.auth_user = {"username": "Javohir", "role": "admin", "region": None}
        assert app_module.get_auth_region() is None


def test_get_auth_region_returns_scoped_email():
    with app_module.app.test_request_context():
        app_module.request.auth_user = {"username": "samarqand_user", "role": "user", "region": "samarqandkiosk@railway.uz"}
        assert app_module.get_auth_region() == "samarqandkiosk@railway.uz"


def _sample_station(email, station, soni, summa, daily=None):
    return {
        "stansiya": station,
        "email": email,
        "soni_val": soni,
        "summa_val": summa,
        "share_percent": round(summa / 1, 2),
        "avg_price": round(summa / soni) if soni else 0,
        "daily_breakdown": daily or [],
    }


def _sample_stats():
    stations = [
        _sample_station("samarqandkiosk@railway.uz", "Самарқанд", 100, 1_000_000,
                         daily=[{"date": "2026-08-01", "tickets": 60, "summa": 600_000},
                                {"date": "2026-08-02", "tickets": 40, "summa": 400_000}]),
        _sample_station("urganchkiosk@railway.uz", "Урганч", 300, 3_000_000,
                         daily=[{"date": "2026-08-01", "tickets": 300, "summa": 3_000_000}]),
    ]
    return {
        "stations": stations,
        "total_tickets": 400,
        "total_summa": 4_000_000,
        "daily_trend": [{"date": "2026-08-01", "tickets": 360, "summa": 3_600_000},
                         {"date": "2026-08-02", "tickets": 40, "summa": 400_000}],
        "available_months": ["2026-08"],
        "monthly_data": {"2026-08": {
            "stations": stations,
            "total_tickets": 400,
            "total_summa": 4_000_000,
        }},
        "overall_data": {"stations": stations, "total_tickets": 400, "total_summa": 4_000_000},
        "ytd_data": {"stations": stations, "total_tickets": 400, "total_summa": 4_000_000},
        "director_summary": {"period_name": "Avgust 2026"},
    }


def test_filter_stats_for_region_recomputes_totals_for_one_station():
    stats = _sample_stats()
    filtered = app_module.filter_stats_for_region(stats, "samarqandkiosk@railway.uz")

    assert len(filtered["stations"]) == 1
    assert filtered["stations"][0]["stansiya"] == "Самарқанд"
    assert filtered["total_tickets"] == 100
    assert filtered["total_summa"] == 1_000_000
    assert filtered["stations"][0]["share_percent"] == 100.0

    assert filtered["overall_data"]["total_tickets"] == 100
    assert filtered["overall_data"]["total_summa"] == 1_000_000
    assert filtered["monthly_data"]["2026-08"]["total_tickets"] == 100

    assert filtered["director_summary"]["net_revenue"] == 1_000_000
    assert filtered["director_summary"]["top_station"] == "Самарқанд"
    assert filtered["director_summary"]["second_station"] == "-"


def test_filter_stats_for_region_unknown_email_yields_empty():
    stats = _sample_stats()
    filtered = app_module.filter_stats_for_region(stats, "unknownkiosk@railway.uz")
    assert filtered["stations"] == []
    assert filtered["total_tickets"] == 0
    assert filtered["total_summa"] == 0


def test_batch_upsert_tickets_is_idempotent(tmp_path):
    db_path = str(tmp_path / "kiosk_data.db")
    database.init_db(db_path)

    tickets = [
        {
            "ticket_number": "T1001",
            "order_id": "O1001",
            "date_str": "01.08.2026",
            "ym": "2026-08",
            "user_email": "samarqandkiosk@railway.uz",
            "station_name": "Самарқанд",
            "payment_type": "Terminal",
            "qty": 1,
            "summa": 50000,
            "status": "ACTIVE",
        },
        {
            "ticket_number": "T1002",
            "order_id": "O1002",
            "date_str": "01.08.2026",
            "ym": "2026-08",
            "user_email": "samarqandkiosk@railway.uz",
            "station_name": "Самарқанд",
            "payment_type": "Payme",
            "qty": 1,
            "summa": 70000,
            "status": "ACTIVE",
        },
    ]

    first = database.batch_upsert_tickets(db_path, tickets)
    assert first["inserted"] == 2

    second = database.batch_upsert_tickets(db_path, tickets)
    assert second["inserted"] == 0

    conn = database.get_db_connection(db_path)
    count = conn.execute("SELECT COUNT(*) FROM tickets").fetchone()[0]
    conn.close()
    assert count == 2


def test_get_paginated_tickets_restrict_email(tmp_path):
    db_path = str(tmp_path / "kiosk_data.db")
    database.init_db(db_path)
    tickets = [
        {
            "ticket_number": "T2001",
            "order_id": "O2001",
            "date_str": "01.08.2026",
            "ym": "2026-08",
            "user_email": "samarqandkiosk@railway.uz",
            "station_name": "Самарқанд",
            "payment_type": "Terminal",
            "qty": 1,
            "summa": 50000,
            "status": "ACTIVE",
        },
        {
            "ticket_number": "T2002",
            "order_id": "O2002",
            "date_str": "01.08.2026",
            "ym": "2026-08",
            "user_email": "urganchkiosk@railway.uz",
            "station_name": "Урганч",
            "payment_type": "Terminal",
            "qty": 1,
            "summa": 90000,
            "status": "ACTIVE",
        },
    ]
    database.batch_upsert_tickets(db_path, tickets)

    result = database.get_paginated_tickets_from_db(
        db_path, restrict_email="samarqandkiosk@railway.uz"
    )
    rows = result["tickets"] if isinstance(result, dict) and "tickets" in result else result[0]
    emails = {row["user_email"] for row in rows}
    assert emails == {"samarqandkiosk@railway.uz"}


def test_login_rejects_inactive_user(client, users_file):
    # Set samarqand_user is_active = False
    users = json.loads(users_file.read_text(encoding="utf-8"))
    for u in users:
        if u["username"] == "samarqand_user":
            u["is_active"] = False
    users_file.write_text(json.dumps(users), encoding="utf-8")

    resp = client.post("/api/auth/login", json={"username": "samarqand_user", "password": "SamPass1!"})
    assert resp.status_code == 403
    data = resp.get_json()
    assert data["success"] is False
    assert "faolsizlantirilgan" in data["error"].lower()


def test_admin_can_update_user_status_and_reset_password(client):
    admin_token = app_module.issue_token("Javohir", "admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Deactivate user
    resp = client.put("/api/users/samarqand_user", json={"is_active": False}, headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()["user"]["is_active"] is False

    # Try login as deactivated user -> 403
    login_resp = client.post("/api/auth/login", json={"username": "samarqand_user", "password": "SamPass1!"})
    assert login_resp.status_code == 403

    # Reactivate user and reset password
    resp = client.put(
        "/api/users/samarqand_user",
        json={"is_active": True, "password": "BrandNewPass2026!"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.get_json()["user"]["is_active"] is True

    # Login with new password -> 200
    login_resp2 = client.post("/api/auth/login", json={"username": "samarqand_user", "password": "BrandNewPass2026!"})
    assert login_resp2.status_code == 200
    assert login_resp2.get_json()["success"] is True


def test_master_admin_cannot_be_deactivated(client):
    admin_token = app_module.issue_token("Javohir", "admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = client.put("/api/users/Javohir", json={"is_active": False}, headers=headers)
    assert resp.status_code == 400
    assert resp.get_json()["success"] is False


def test_default_kiosk_accounts_seeded(tmp_path, monkeypatch):
    empty_users_file = tmp_path / "empty_users.json"
    monkeypatch.setattr(app_module, "USERS_FILE", str(empty_users_file))

    loaded = app_module.load_users()
    usernames = {u["username"] for u in loaded}
    expected_kiosks = [k["username"] for k in app_module.DEFAULT_KIOSK_ACCOUNTS]

    for ek in expected_kiosks:
        assert ek in usernames


def test_excel_import_extracts_all_fields_and_is_idempotent(tmp_path):
    import io
    import pandas as pd

    db_path = str(tmp_path / "test_import.db")
    database.init_db(db_path)
    email_map = app_module.DEFAULT_EMAIL_MAP

    data = {
        "№": [1, 2, 3],
        "Код заказа": ["ORD101", "ORD102", "ORD103"],
        "Дата создания": ["01.08.2026 10:00", "01.08.2026 11:00", "01.08.2026 12:00"],
        "Пользователь": ["samarqandkiosk@railway.uz", "samarqandkiosk@railway.uz", "unknown_user@gmail.com"],
        "Номера билетов": ["TK1001, TK1002", "TK1003", "TK9999"],
        "Количество билетов": [2, 1, 1],
        "Номера поездов": ["001Ф", "002Ф", "003Ф"],
        "Организация": ["Afrosiyob", "Default", "Other"],
        "Станция отправления": ["САМАРКАНД", "САМАРКАНД", "ТОШКЕНТ"],
        "Станция прибытия": ["ТОШКЕНТ-ЙУЛОВЧИ", "БУХОРО 1", "АНДИЖОН"],
        "Общая стоимость": [400000, 150000, 200000],
        "Страховка": [4000, 2000, 1000],
        "Статус": ["ACTIVE", "ACTIVE", "ACTIVE"],
        "Способ оплаты": ["Payme", "HamkorbankHold", "Payme"],
    }
    df = pd.DataFrame(data)
    excel_buf = io.BytesIO()
    with pd.ExcelWriter(excel_buf, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Orders List", index=False)
    excel_bytes = excel_buf.getvalue()

    # Import #1
    res1 = database.smart_parse_and_save_excel(db_path, excel_bytes, "test.xlsx", email_map)
    assert res1["status"] == "success"
    # Row 1 splits into 2 tickets (TK1001, TK1002), Row 2 is 1 ticket (TK1003), Row 3 is unknown email (skipped)
    assert res1["metrics"]["inserted"] == 3
    assert res1["metrics"]["skipped_not_whitelisted"] == 1
    assert res1["metrics"]["inserted_amount"] == 550000.0

    # Import #2 (same file) -> 0 inserted, 3 skipped (idempotent!)
    res2 = database.smart_parse_and_save_excel(db_path, excel_bytes, "test.xlsx", email_map)
    assert res2["status"] == "success"
    assert res2["metrics"]["inserted"] == 0
    assert res2["metrics"]["skipped"] == 3

    # Verify extracted fields in database
    conn = database.get_db_connection(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT ticket_number, organization, payment_method, train_numbers, departure_station, arrival_station, insurance, summa FROM tickets ORDER BY ticket_number")
    rows = cursor.fetchall()
    conn.close()

    assert len(rows) == 3
    # Row 1 split
    assert rows[0]["ticket_number"] == "TK1001"
    assert rows[0]["organization"] == "Afrosiyob"
    assert rows[0]["payment_method"] == "Payme"
    assert rows[0]["train_numbers"] == "001Ф"
    assert rows[0]["departure_station"] == "САМАРКАНД"
    assert rows[0]["arrival_station"] == "ТОШКЕНТ-ЙУЛОВЧИ"
    assert rows[0]["summa"] == 200000.0
    assert rows[0]["insurance"] == 2000.0

