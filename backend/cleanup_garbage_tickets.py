"""
Bir martalik skript: report-format Excel yuklashda paydo bo'lgan "chiqindi"
ticket qatorlarini (bo'sh sana, bo'sh email, station_name "Noma'lum" yoki bo'sh)
tickets jadvalidan tozalaydi.

Ishlatish:
    python cleanup_garbage_tickets.py [--db-path PATH] [--confirm]

Standart holatda faqat DRY-RUN qiladi (hech narsani o'zgartirmaydi, faqat
nechta qator o'chirilishini va namunalarni ko'rsatadi). Haqiqatan o'chirish
uchun --confirm flagini qo'shing.

Production (Render.com)da ishlatish uchun bu skriptni Render shell orqali
backend papkasida ishga tushiring, --db-path kerak bo'lsa haqiqiy DB yo'liga
moslang (odatda UPLOAD_FOLDER ichidagi kiosk_data.db).
"""
import argparse
import os
import sqlite3
import sys

DELETE_WHERE = """
    date_str = '' AND user_email = '' AND station_name IN ("Noma'lum", '')
"""


def main():
    parser = argparse.ArgumentParser(description="Chiqindi ticket qatorlarini tozalash")
    parser.add_argument(
        '--db-path',
        default=os.path.join(os.path.dirname(__file__), 'kiosk_data.db'),
        help="SQLite baza fayli yo'li (standart: backend/kiosk_data.db)"
    )
    parser.add_argument(
        '--confirm',
        action='store_true',
        help="Haqiqatan o'chirish uchun. Bermasangiz faqat dry-run qiladi."
    )
    args = parser.parse_args()

    if not os.path.exists(args.db_path):
        print(f"XATOLIK: baza fayli topilmadi: {args.db_path}")
        sys.exit(1)

    conn = sqlite3.connect(args.db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(f"SELECT COUNT(*) FROM tickets WHERE {DELETE_WHERE}")
    count = cursor.fetchone()[0]

    print(f"Baza: {args.db_path}")
    print(f"Topilgan chiqindi qatorlar soni: {count}")

    if count > 0:
        cursor.execute(f"SELECT ticket_number, station_name, date_str, user_email, summa FROM tickets WHERE {DELETE_WHERE} LIMIT 10")
        print("\nNamuna qatorlar (birinchi 10 ta):")
        for row in cursor.fetchall():
            print(f"  {dict(row)}")

    if not args.confirm:
        print("\nBu DRY-RUN edi — hech narsa o'chirilmadi. Haqiqatan o'chirish uchun --confirm bilan qayta ishga tushiring.")
        conn.close()
        return

    if count == 0:
        print("\nO'chiriladigan qator yo'q.")
        conn.close()
        return

    cursor.execute(f"DELETE FROM tickets WHERE {DELETE_WHERE}")
    conn.commit()
    print(f"\n{cursor.rowcount} ta chiqindi qator o'chirildi.")
    conn.close()


if __name__ == '__main__':
    main()
