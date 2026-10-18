import sqlite3
import json

con = sqlite3.connect('/home/ese/tfhc-production/data/operational.db')
cur = con.cursor()

cur.execute("SELECT * FROM payments WHERE createdAt >= 1792015620000")
cols = [d[0] for d in cur.description]
rows = cur.fetchall()

print(f"Total payments created after cutover: {len(rows)}")
for r in rows:
    d = dict(zip(cols, r))
    # truncate base64 metadata for display
    meta = d.get('metadata')
    if meta and len(meta) > 100:
        d['metadata'] = meta[:60] + '... [truncated]'
    print(json.dumps(d, default=str))

con.close()
