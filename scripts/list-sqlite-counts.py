import sqlite3

con = sqlite3.connect('/home/ese/tfhc-production/data/operational.db')
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_sync%' AND name NOT LIKE 'sqlite%'")
tables = [r[0] for r in cur.fetchall()]

for t in tables:
    cur.execute(f"PRAGMA table_info('{t}')")
    cols = [c[1] for c in cur.fetchall()]
    for c in ['createdAt', 'created_at', 'timestamp']:
        if c in cols:
            try:
                cur.execute(f"SELECT COUNT(*) FROM '{t}' WHERE {c} >= 1792015620000 OR {c} >= '2026-10-15T19:00:00'")
                cnt = cur.fetchone()[0]
                if cnt > 0:
                    print(f"{t}: {cnt} rows")
            except:
                pass
con.close()
