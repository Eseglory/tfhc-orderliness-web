import sqlite3
import json

con = sqlite3.connect('/home/ese/tfhc-production/data/operational.db')
cur = con.cursor()

# Check tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_sync%' AND name NOT LIKE 'sqlite%'")
tables = [r[0] for r in cur.fetchall()]

print("=== CHECKING ALL TABLES IN OPERATIONAL.DB FOR UNSYNCED OCT 15-18 RECORDS ===")
for t in tables:
    cur.execute(f"PRAGMA table_info('{t}')")
    cols = [c[1] for c in cur.fetchall()]
    
    # check if table has id and createdAt / created_at / timestamp
    t_cols = [c for c in cols if c in ['createdAt', 'created_at', 'timestamp']]
    if not t_cols:
        continue
    time_col = t_cols[0]
    
    # Oct 15 19:47 was cutover time. 1792108800000 is ~Oct 16 00:00 UTC. 1792015620000 is Oct 15 19:00 UTC.
    query = f"""
        SELECT * FROM '{t}' 
        WHERE {time_col} >= 1792015620000 
           OR {time_col} >= '2026-10-15T19:00:00'
    """
    try:
        cur.execute(query)
        rows = cur.fetchall()
        if rows:
            print(f"\n--- Table '{t}' has {len(rows)} record(s) created after cutover ---")
            d_cols = [d[0] for d in cur.description]
            for r in rows:
                d = dict(zip(d_cols, r))
                print(json.dumps(d, default=str))
    except Exception as e:
        # try without time filter if text/int mismatch
        pass

con.close()
