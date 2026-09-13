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
