#!/usr/bin/env python3
"""
Kiosk Hisobot Adminka - Database Management & DevOps CLI Tool

Usage:
    python backend/db_manager.py health
    python backend/db_manager.py consistency
    python backend/db_manager.py backup [--dir BACKUP_DIR]
    python backend/db_manager.py verify
"""
import sys
import os
import argparse
import json

# Add backend directory to sys.path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import get_database_path, load_mappings
from database import (
    get_database_health,
    get_database_consistency_report,
    create_database_backup,
    get_db_connection
)


def cmd_health(args):
    db_path = args.db or get_database_path()
    print(f"\n[Database Health Check] Target: {db_path}")
    health = get_database_health(db_path)

    if not health.get('exists'):
        print(f"XATOLIK: Baza fayli mavjud emas: {db_path}")
        sys.exit(1)

    print("-" * 60)
    print(f"Fayl yo'li:              {health['database_path']}")
    print(f"Fayl hajmi:              {health['size_mb']} MB ({health['size_bytes']:,} bayt)")
    print(f"SQLite versiyasi:        {health['sqlite_version']}")
    print(f"Jurnallash rejimi (WAL): {health['journal_mode'].upper()}")
    print(f"Foreign Keys:            {'YOQILGAN' if health['foreign_keys'] else 'OCHIRILGAN'}")
    print(f"Synchronous:             {health['synchronous']}")
    print(f"Baza yaxlitligi:         {health['integrity_status'].upper()}")
    print(f"Jami chiptalar:          {health['tickets_count']:,}")
    print(f"Unikal chiptalar:        {health['distinct_tickets_count']:,}")
    print(f"Dublikatlar mavjudmi:    {'XA (!)' if health['has_ticket_duplicates'] else 'YOQ (Mukammal)'}")
    print(f"Qo'lda tahrirlar soni:   {health['overrides_count']}")
    print(f"Oxirgi chipta sanasi:    {health['last_uploaded_at']}")
    print("-" * 60)
    print("Jadvallar bo'yicha qatorlar soni:")
    for table, count in health['table_counts'].items():
        print(f"  - {table:<25}: {count:,} qator")
    print("-" * 60)
    print(f"Umumiy holat:            {health['status'].upper()}\n")


def cmd_consistency(args):
    db_path = args.db or get_database_path()
    print(f"\n[Data Consistency Audit] Target: {db_path}")
    email_map = load_mappings()
    report = get_database_consistency_report(db_path, email_map)

    if report.get('status') != 'success':
        print(f"XATOLIK: {report.get('message')}")
        sys.exit(1)

    print("-" * 60)
    print(f"Baza muvofiqligi:        {'MUKAMMAL' if report['is_consistent'] else 'OGOHLANTIRISH'}")
    print(f"Dublikat chiptalar:      {report['duplicate_tickets_count']}")
    print(f"Bo'sh ticket_number:     {report['empty_ticket_numbers_count']}")
    print(f"Bo'sh sana (date_str):   {report['empty_dates_count']}")
    print(f"Bo'sh oy (ym):           {report['empty_ym_count']}")
    print(f"Bo'sh email:             {report['empty_emails_count']}")
    print(f"Manfiy summalar:         {report['negative_amounts_count']}")
    print(f"Noma'lum email kassa:    {report['unmapped_emails_count']}")
    print(f"Faol tahrirlar:          {report['active_overrides_count']}")
    print("-" * 60)

    if report['issues_detected']:
        print("Aniqlangan eslatmalar:")
        for issue in report['issues_detected']:
            print(f"  ! {issue}")
        print("-" * 60)
    else:
        print("Hech qanday nomuvofiqlik aniqlanmadi. Baza 100% sog'lom!\n")


def cmd_backup(args):
    db_path = args.db or get_database_path()
    backup_dir = args.dir
    print(f"\n[Online Database Backup] Target: {db_path}")
    try:
        backup_path = create_database_backup(db_path, backup_dir=backup_dir)
        size_bytes = os.path.getsize(backup_path)
        size_mb = round(size_bytes / (1024 * 1024), 2)
        print(f"MUVAFFAQIYATLI: Zaxira nusxa yaratildi va yaxlitligi tekshirildi:")
        print(f"  Fayl:  {backup_path}")
        print(f"  Hajmi: {size_mb} MB ({size_bytes:,} bayt)\n")
    except Exception as e:
        print(f"XATOLIK: Zaxira nusxa yaratib bo'lmadi: {e}")
        sys.exit(1)


def cmd_verify(args):
    db_path = args.db or get_database_path()
    print(f"\n[Database Quick Verification] Target: {db_path}")
    health = get_database_health(db_path)

    assert health['exists'], f"Database not found at {db_path}"
    assert health['integrity_status'] == 'ok', f"Integrity check failed: {health['integrity_status']}"
    assert not health['has_ticket_duplicates'], "Duplicate tickets found in database!"
    assert health['tickets_count'] >= 6612, f"Ticket count {health['tickets_count']} is below expected 6,612!"

    print("VERIFIKATSIYA MUVAFFAQIYATLI O'TDI:")
    print(f"  - Integrity check:  OK")
    print(f"  - Journal mode:     {health['journal_mode']}")
    print(f"  - Tickets count:    {health['tickets_count']} (expected >= 6,612)")
    print(f"  - Duplicate check:  Zero duplicates")
    print("Barcha tekshiruvlar 100% muvaffaqiyatli!\n")


def main():
    parser = argparse.ArgumentParser(description="Kiosk Hisobot Adminka Database DevOps Tool")
    parser.add_argument('--db', default=None, help="SQLite baza fayli yo'li (standart: get_database_path())")
    subparsers = parser.add_subparsers(dest='command', help="Buyruqlar")

    # health
    subparsers.add_parser('health', help="Baza salomatligi va PRAGMA ma'lumotlarini ko'rish")

    # consistency
    subparsers.add_parser('consistency', help="Ma'lumotlar yaxlitligi va dublikatlarni tekshirish")

    # backup
    backup_parser = subparsers.add_parser('backup', help="Onlayn atomik zaxira nusxa olish")
    backup_parser.add_argument('--dir', default=None, help="Zaxira saqlanadigan papka")

    # verify
    subparsers.add_parser('verify', help="Tezkor qat'iy assertions tekshiruvi")

    args = parser.parse_args()

    if args.command == 'health':
        cmd_health(args)
    elif args.command == 'consistency':
        cmd_consistency(args)
    elif args.command == 'backup':
        cmd_backup(args)
    elif args.command == 'verify':
        cmd_verify(args)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
