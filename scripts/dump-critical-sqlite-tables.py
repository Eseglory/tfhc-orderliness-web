import sqlite3
import json

con = sqlite3.connect('/home/ese/tfhc-production/data/operational.db')
cur = con.cursor()

def dump_table(name):
    print(f"\n=== TABLE: {name} ===")
    cur.execute(f"PRAGMA table_info('{name}')")
    cols = [c[1] for c in cur.fetchall()]
    time_col = 'createdAt' if 'createdAt' in cols else ('created_at' if 'created_at' in cols else 'timestamp')
    cur.execute(f"SELECT * FROM '{name}' WHERE {time_col} >= 1792015620000 OR {time_col} >= '2026-10-15T19:00:00'")
    d_cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"Total: {len(rows)}")
    for r in rows:
        print(json.dumps(dict(zip(d_cols, r)), default=str))

dump_table('users')
dump_table('meetings')
dump_table('payments')
dump_table('attendance_records')

con.close()
