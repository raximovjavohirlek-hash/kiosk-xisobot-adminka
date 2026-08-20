import sqlite3
import os
import json
import re
import hashlib

def get_db_connection(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path):
    conn = get_db_connection(db_path)
    cursor = conn.cursor()
    
    # 1. Monthly Summary Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS monthly_summaries (
            ym TEXT PRIMARY KEY,
            total_tickets INTEGER DEFAULT 0,
            total_summa REAL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 2. Station Monthly Stats Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS station_monthly_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ym TEXT NOT NULL,
            station_name TEXT NOT NULL,
            email TEXT NOT NULL,
            tickets INTEGER DEFAULT 0,
            summa REAL DEFAULT 0,
            share_percent REAL DEFAULT 0,
            UNIQUE(ym, email)
        )
    ''')

    # 3. Daily Stats Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS daily_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ym TEXT NOT NULL,
            date_str TEXT NOT NULL,
            total_tickets INTEGER DEFAULT 0,
            total_summa REAL DEFAULT 0,
            online_tickets INTEGER DEFAULT 0,
            online_summa REAL DEFAULT 0,
            terminal_tickets INTEGER DEFAULT 0,
            terminal_summa REAL DEFAULT 0,
            UNIQUE(ym, date_str)
        )
    ''')

    # 4. Station Daily Breakdown Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS station_daily_breakdown (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ym TEXT NOT NULL,
            date_str TEXT NOT NULL,
            email TEXT NOT NULL,
            tickets INTEGER DEFAULT 0,
            summa REAL DEFAULT 0,
            UNIQUE(ym, date_str, email)
        )
    ''')

    # 5. Idempotent Individual Tickets Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tickets (
            ticket_number TEXT PRIMARY KEY,
            order_id TEXT,
            date_str TEXT,
            ym TEXT,
            user_email TEXT,
            station_name TEXT,
            payment_type TEXT DEFAULT 'Terminal',
            qty INTEGER DEFAULT 1,
            summa REAL DEFAULT 0,
            status TEXT DEFAULT 'ACTIVE',
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_ym ON tickets(ym)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_date ON tickets(date_str)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_email)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_tickets_station ON tickets(station_name)')

    conn.commit()
    conn.close()

def batch_upsert_tickets(db_path, ticket_list, batch_size=1000):
    """
    Inserts ticket dictionaries into SQLite using batch transactions and INSERT OR IGNORE.
    Returns dict: {'total_read': int, 'inserted': int, 'skipped': int}
    """
    if not ticket_list:
        return {'total_read': 0, 'inserted': 0, 'skipped': 0}

    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    total_read = len(ticket_list)
    inserted_count = 0
    skipped_count = 0

    try:
        sql = '''
            INSERT OR IGNORE INTO tickets (
                ticket_number, order_id, date_str, ym, user_email,
                station_name, payment_type, qty, summa, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''

        cursor.execute("SELECT COUNT(*) FROM tickets")
        count_before = cursor.fetchone()[0]

        params_batch = []
        for idx, t in enumerate(ticket_list):
            t_num = str(t.get('ticket_number') or '').strip()
            if not t_num:
                raw_str = f"{t.get('date_str')}_{t.get('user_email')}_{t.get('station_name')}_{t.get('qty')}_{t.get('summa')}_{t.get('payment_type')}_{idx}"
                t_num = "TICK_" + hashlib.sha256(raw_str.encode()).hexdigest()[:16].upper()

            order_id = str(t.get('order_id') or t_num)
            date_str = str(t.get('date_str') or '')
            ym = str(t.get('ym') or '')
            if not ym and len(date_str) >= 10:
                parts = date_str.split('.')
                if len(parts) == 3:
                    ym = f"{parts[2]}-{parts[1]}"
            
            user_email = str(t.get('user_email') or '')
            station_name = str(t.get('station_name') or '')
            payment_type = str(t.get('payment_type') or 'Terminal')
            qty = int(t.get('qty') or 1)
            summa = float(t.get('summa') or 0)
            status = str(t.get('status') or 'ACTIVE')

            params_batch.append((
                t_num, order_id, date_str, ym, user_email,
                station_name, payment_type, qty, summa, status
            ))

            if len(params_batch) >= batch_size:
                cursor.executemany(sql, params_batch)
                params_batch = []

        if params_batch:
            cursor.executemany(sql, params_batch)

        conn.commit()

        cursor.execute("SELECT COUNT(*) FROM tickets")
        count_after = cursor.fetchone()[0]

        inserted_count = count_after - count_before
        skipped_count = total_read - inserted_count

    except Exception as ex:
        print("batch_upsert_tickets error:", ex)
        conn.rollback()
    finally:
        conn.close()

    return {
        'total_read': total_read,
        'inserted': inserted_count,
        'skipped': skipped_count
    }

def get_paginated_tickets_from_db(db_path, page=1, per_page=20, search='', station='', ym=''):
    init_db(db_path)
    if not os.path.exists(db_path):
        return {'tickets': [], 'total_count': 0, 'page': page, 'per_page': per_page, 'total_pages': 0}

    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    try:
        query_conditions = ["1=1"]
        params = []

        if search:
            query_conditions.append("(ticket_number LIKE ? OR order_id LIKE ? OR station_name LIKE ? OR user_email LIKE ?)")
            s_param = f"%{search}%"
            params.extend([s_param, s_param, s_param, s_param])

        if station:
            query_conditions.append("station_name = ?")
            params.append(station)

        if ym:
            query_conditions.append("ym = ?")
            params.append(ym)

        where_clause = " WHERE " + " AND ".join(query_conditions)

        cursor.execute(f"SELECT COUNT(*) FROM tickets {where_clause}", params)
        total_count = cursor.fetchone()[0]

        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 0
        offset = (page - 1) * per_page

        cursor.execute(f'''
            SELECT ticket_number, order_id, date_str, ym, user_email, station_name,
                   payment_type, qty, summa, status, uploaded_at
            FROM tickets
            {where_clause}
            ORDER BY date_str DESC, ticket_number DESC
            LIMIT ? OFFSET ?
        ''', params + [per_page, offset])

        tickets = [dict(r) for r in cursor.fetchall()]
        conn.close()

        return {
            'tickets': tickets,
            'total_count': total_count,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages
        }

    except Exception as ex:
        print("get_paginated_tickets_from_db error:", ex)
        conn.close()
        return {'tickets': [], 'total_count': 0, 'page': page, 'per_page': per_page, 'total_pages': 0}

def save_monthly_report_to_db(db_path, ym, stats):
    if not ym or not stats:
        return
    
    init_db(db_path)
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    try:
        t_tickets = stats.get('total_tickets', 0)
        t_summa = stats.get('total_summa', 0)

        # 1. Upsert Monthly Summary
        cursor.execute('''
            INSERT INTO monthly_summaries (ym, total_tickets, total_summa, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(ym) DO UPDATE SET
                total_tickets = excluded.total_tickets,
                total_summa = excluded.total_summa,
                updated_at = CURRENT_TIMESTAMP
        ''', (ym, t_tickets, t_summa))

        # 2. Upsert Station Monthly Stats
        for st in stats.get('stations', []):
            st_name = st.get('stansiya', '')
            email = st.get('email', '')
            soni = st.get('soni_val', 0)
            summa = st.get('summa_val', 0)
            sh_pct = st.get('share_percent', 0)

            cursor.execute('''
                INSERT INTO station_monthly_stats (ym, station_name, email, tickets, summa, share_percent)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(ym, email) DO UPDATE SET
                    station_name = excluded.station_name,
                    tickets = excluded.tickets,
                    summa = excluded.summa,
                    share_percent = excluded.share_percent
            ''', (ym, st_name, email, soni, summa, sh_pct))

            # Station daily breakdown if available
            for d_item in st.get('daily_breakdown', []):
                d_str = d_item.get('date')
                d_tix = d_item.get('tickets', 0)
                d_sum = d_item.get('summa', 0)
                if d_str:
                    cursor.execute('''
                        INSERT INTO station_daily_breakdown (ym, date_str, email, tickets, summa)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(ym, date_str, email) DO UPDATE SET
                            tickets = excluded.tickets,
                            summa = excluded.summa
                    ''', (ym, d_str, email, d_tix, d_sum))

        # 3. Upsert Daily Stats
        for d in stats.get('daily_trend', []):
            d_str = d.get('date')
            if d_str:
                d_tix = d.get('tickets', 0)
                d_sum = d.get('summa', 0)
                on_t = d.get('online_tickets', 0)
                on_s = d.get('online_summa', 0)
                term_t = d.get('terminal_tickets', 0)
                term_s = d.get('terminal_summa', 0)

                cursor.execute('''
                    INSERT INTO daily_stats (ym, date_str, total_tickets, total_summa, online_tickets, online_summa, terminal_tickets, terminal_summa)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ym, date_str) DO UPDATE SET
                        total_tickets = excluded.total_tickets,
                        total_summa = excluded.total_summa,
                        online_tickets = excluded.online_tickets,
                        online_summa = excluded.online_summa,
                        terminal_tickets = excluded.terminal_tickets,
                        terminal_summa = excluded.terminal_summa
                ''', (ym, d_str, d_tix, d_sum, on_t, on_s, term_t, term_s))

        conn.commit()
    except Exception as ex:
        print("save_monthly_report_to_db error:", ex)
        conn.rollback()
    finally:
        conn.close()

def get_all_stats_from_db(db_path, email_map):
    if not os.path.exists(db_path):
        return None
    
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='monthly_summaries'")
        if not cursor.fetchone():
            conn.close()
            return None

        cursor.execute("SELECT ym, total_tickets, total_summa FROM monthly_summaries ORDER BY ym DESC")
        summary_rows = cursor.fetchall()
        if not summary_rows:
            conn.close()
            return None

        MONTH_NAMES = {
            '01': 'Yanvar', '02': 'Fevral', '03': 'Mart', '04': 'Aprel',
            '05': 'May', '06': 'Iyun', '07': 'Iyul', '08': 'Avgust',
            '09': 'Sentabr', '10': 'Oktabr', '11': 'Noyabr', '12': 'Dekabr'
        }

        monthly_data = {}
        available_months = []

        for row in summary_rows:
            ym = row['ym']
            y, m = ym.split('-')
            m_name = f"{MONTH_NAMES.get(m, m)} {y}"
            available_months.append({'code': ym, 'name': m_name})

            cursor.execute('''
                SELECT station_name, email, tickets, summa, share_percent 
                FROM station_monthly_stats 
                WHERE ym = ? 
                ORDER BY summa DESC
            ''', (ym,))
            st_rows = cursor.fetchall()
            
            stations = []
            for sr in st_rows:
                cursor.execute('''
                    SELECT date_str as date, tickets, summa 
                    FROM station_daily_breakdown 
                    WHERE ym = ? AND email = ? 
                    ORDER BY date_str ASC
                ''', (ym, sr['email']))
                db_rows = [dict(r) for r in cursor.fetchall()]

                stations.append({
                    'stansiya': sr['station_name'],
                    'email': sr['email'],
                    'soni_val': sr['tickets'],
                    'summa_val': sr['summa'],
                    'share_percent': sr['share_percent'],
                    'daily_breakdown': db_rows
                })

            cursor.execute('''
                SELECT date_str as date, total_tickets as tickets, total_summa as summa,
                       online_tickets, online_summa, terminal_tickets, terminal_summa
                FROM daily_stats
                WHERE ym = ?
                ORDER BY date_str ASC
            ''', (ym,))
            d_rows = [dict(r) for r in cursor.fetchall()]

            monthly_data[ym] = {
                'total_tickets': row['total_tickets'],
                'total_summa': row['total_summa'],
                'stations': stations,
                'daily_trend': d_rows
            }

        conn.close()

        latest_ym = available_months[0]['code'] if available_months else '2026-08'
        latest_stats = monthly_data.get(latest_ym, {})

        ytd_tix = sum(monthly_data[m]['total_tickets'] for m in monthly_data if m.startswith('2026'))
        ytd_sum = sum(monthly_data[m]['total_summa'] for m in monthly_data if m.startswith('2026'))
        
        station_totals_agg = {}
        for ym, m_dict in monthly_data.items():
            if ym.startswith('2026'):
                for st in m_dict.get('stations', []):
                    em = st['email']
                    if em not in station_totals_agg:
                        station_totals_agg[em] = {
                            'stansiya': st['stansiya'],
                            'email': em,
                            'soni_val': 0,
                            'summa_val': 0
                        }
                    station_totals_agg[em]['soni_val'] += st['soni_val']
                    station_totals_agg[em]['summa_val'] += st['summa_val']

        overall_stations = sorted(list(station_totals_agg.values()), key=lambda x: x['summa_val'], reverse=True)
        for st in overall_stations:
            st['share_percent'] = round((st['summa_val'] / ytd_sum) * 100, 1) if ytd_sum > 0 else 0

        ytd_data = {
            'year': '2026',
            'total_tickets': ytd_tix,
            'total_summa': ytd_sum,
            'stations': overall_stations,
            'daily_trend': latest_stats.get('daily_trend', [])
        }

        overall_data = {
            'total_tickets': ytd_tix,
            'total_summa': ytd_sum,
            'stations': overall_stations,
            'daily_trend': latest_stats.get('daily_trend', [])
        }

        return {
            'available_months': available_months,
            'monthly_data': monthly_data,
            'total_tickets': latest_stats.get('total_tickets', 0),
            'total_summa': latest_stats.get('total_summa', 0),
            'stations': latest_stats.get('stations', []),
            'daily_trend': latest_stats.get('daily_trend', []),
            'ytd_data': ytd_data,
            'overall_data': overall_data
        }

    except Exception as ex:
        print("get_all_stats_from_db error:", ex)
        conn.close()
        return None
