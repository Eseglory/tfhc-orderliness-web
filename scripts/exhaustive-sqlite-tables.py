import sqlite3
import json

con = sqlite3.connect('/home/ese/tfhc-production/data/operational.db')
cur = con.cursor()

# Get all tables except sqlite internals
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite%'")
tables = sorted([r[0] for r in cur.fetchall()])

print(f"Total tables in operational.db: {len(tables)}")

table_summary = []
for t in tables:
    cur.execute(f"SELECT COUNT(*) FROM \"{t}\"")
    total_cnt = cur.fetchone()[0]
    
    cur.execute(f"PRAGMA table_info(\"{t}\")")
    cols = [c[1] for c in cur.fetchall()]
    
    # Check for date/time columns
    time_cols = [c for c in cols if c in ['createdAt', 'created_at', 'timestamp', 'updatedAt', 'updated_at']]
    
    recent_cnt = 0
    if time_cols:
        col = time_cols[0]
        try:
            # Check for records from Oct 15 19:00 UTC onwards (1792015620000)
            cur.execute(f"SELECT COUNT(*) FROM \"{t}\" WHERE \"{col}\" >= 1792015620000 OR \"{col}\" >= '2026-10-15T19:00:00'")
            recent_cnt = cur.fetchone()[0]
        except Exception:
            pass
            
    table_summary.append({
        'table': t,
        'total': total_cnt,
        'recent': recent_cnt,
        'has_pk': 'id' in cols
    })

print(json.dumps(table_summary, indent=2))
con.close()
