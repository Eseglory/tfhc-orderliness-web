import sqlite3
import json

con = sqlite3.connect('/home/ese/tfhc-production/data/operational.db')
cur = con.cursor()

tables_to_export = [
    'users',
    'meetings',
    'absence_excuses',
    'approval_requests',
    'payments',
    'attendance_records',
    'push_subscriptions',
    'pwa_device_sessions',
    'chat_messages'
]

result = {}

for table in tables_to_export:
    cur.execute(f"PRAGMA table_info('{table}')")
    cols = [c[1] for c in cur.fetchall()]
    time_col = 'createdAt' if 'createdAt' in cols else ('created_at' if 'created_at' in cols else 'timestamp')
    cur.execute(f"SELECT * FROM '{table}' WHERE {time_col} >= 1792015620000 OR {time_col} >= '2026-10-15T19:00:00'")
    d_cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    result[table] = [dict(zip(d_cols, r)) for r in rows]
    print(f"Exported {len(rows)} from {table}")

with open('/tmp/sqlite-export.json', 'w') as f:
    json.dump(result, f, indent=2, default=str)

print("Export complete: /tmp/sqlite-export.json")
con.close()
