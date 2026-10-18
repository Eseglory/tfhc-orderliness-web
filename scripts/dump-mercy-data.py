import sqlite3
import json
from datetime import datetime

con = sqlite3.connect('/home/ese/tfhc-production/data/operational.db')
cur = con.cursor()

print("=== MERCY ABSENCE EXCUSE ===")
cur.execute("SELECT * FROM absence_excuses WHERE id = 'ee87c34f-d8b2-4a2f-842b-61d56a2987a8'")
cols = [d[0] for d in cur.description]
excuse_row = cur.fetchone()
excuse_dict = dict(zip(cols, excuse_row))
print(json.dumps(excuse_dict, indent=2, default=str))

created_ts = excuse_dict['createdAt']
if isinstance(created_ts, (int, float)):
    print("Created Date ISO:", datetime.utcfromtimestamp(created_ts / 1000.0).isoformat() + "Z")

print("\n=== LINKED APPROVAL REQUEST ===")
cur.execute("SELECT * FROM approval_requests WHERE id = ?", (excuse_dict.get('approvalRequestId'),))
cols = [d[0] for d in cur.description]
app_row = cur.fetchone()
if app_row:
    app_dict = dict(zip(cols, app_row))
    print(json.dumps(app_dict, indent=2, default=str))
else:
    print("No approval request found with id:", excuse_dict.get('approvalRequestId'))

print("\n=== APPROVAL ACTIONS ===")
cur.execute("SELECT * FROM approval_actions WHERE approvalRequestId = ?", (excuse_dict.get('approvalRequestId'),))
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    print(json.dumps(dict(zip(cols, r)), indent=2, default=str))

print("\n=== ALL OTHER RECORDS CREATED IN OPERATIONAL.DB ON OCT 16 OR OCT 17 ===")
# Check which business tables had new rows
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_sync%'")
tables = [r[0] for r in cur.fetchall()]
for t in tables:
    cur.execute(f"PRAGMA table_info('{t}')")
    tcols = [c[1] for c in cur.fetchall()]
    for c in ['createdAt', 'created_at']:
        if c in tcols:
            try:
                # createdAt could be integer ms or text
                cur.execute(f"SELECT COUNT(*) FROM '{t}' WHERE {c} >= 1792108800000 OR {c} LIKE '2026-10-16%' OR {c} LIKE '2026-10-17%'")
                cnt = cur.fetchone()[0]
                if cnt > 0:
                    print(f"Table '{t}': {cnt} row(s)")
                    cur.execute(f"SELECT * FROM '{t}' WHERE {c} >= 1792108800000 OR {c} LIKE '2026-10-16%' OR {c} LIKE '2026-10-17%'")
                    rcols = [d[0] for d in cur.description]
                    for row in cur.fetchall():
                        print("  ->", json.dumps(dict(zip(rcols, row)), default=str))
            except Exception as e:
                pass

con.close()
