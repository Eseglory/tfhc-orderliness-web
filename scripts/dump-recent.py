import sqlite3
import json

con = sqlite3.connect('/home/ese/tfhc-production/data/operational.db')
cur = con.cursor()
for table in ['users', 'meetings', 'payments']:
    cur.execute(f"SELECT * FROM {table} WHERE createdAt >= 1792015620000")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"\n=== {table}: {len(rows)} ===")
    for r in rows:
        print(json.dumps(dict(zip(cols, r)), default=str))

con.close()
