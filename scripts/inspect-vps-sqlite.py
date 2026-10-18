import sqlite3
import json

db_path = '/home/ese/tfhc-production/data/operational.db'
con = sqlite3.connect(db_path)
cur = con.cursor()

mercy_member_id = '459baa9f-190f-4296-a8c0-7a927e58dfb6'
mercy_user_id = '9a9c6a28-04f6-43c4-b1ae-1865cd0c835d'

print("=== CHECKING OPERATIONAL.DB ON VPS ===")

# 1. Check welfare_requests
try:
    cur.execute("SELECT * FROM welfare_requests")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"welfare_requests: {len(rows)} total rows")
    for r in rows:
        d = dict(zip(cols, r))
        print("Welfare:", json.dumps(d, default=str))
except Exception as e:
    print("welfare_requests error:", e)

# 2. Check absence_excuses
try:
    cur.execute("SELECT * FROM absence_excuses WHERE memberId = ? OR createdAt LIKE '2026-10-17%'", (mercy_member_id,))
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"absence_excuses matching Mercy or 2026-10-17: {len(rows)} rows")
    for r in rows:
        d = dict(zip(cols, r))
        print("Excuse:", json.dumps(d, default=str))
except Exception as e:
    print("absence_excuses error:", e)

# 3. Check correction_requests
try:
    cur.execute("SELECT * FROM correction_requests WHERE memberId = ? OR createdAt LIKE '2026-10-17%'", (mercy_member_id,))
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"correction_requests matching Mercy or 2026-10-17: {len(rows)} rows")
    for r in rows:
        d = dict(zip(cols, r))
        print("Correction:", json.dumps(d, default=str))
except Exception as e:
    print("correction_requests error:", e)

# 4. Check approval_requests
try:
    cur.execute("SELECT * FROM approval_requests WHERE requestedByMemberId = ? OR memberId = ? OR createdAt LIKE '2026-10-17%'", (mercy_member_id, mercy_member_id))
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    print(f"approval_requests matching Mercy or 2026-10-17: {len(rows)} rows")
    for r in rows:
        d = dict(zip(cols, r))
        print("Approval:", json.dumps(d, default=str))
except Exception as e:
    print("approval_requests error:", e)

# 5. Check replication tables / sync journal
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%sync%' OR name LIKE '%journal%' OR name LIKE '%operation%' OR name LIKE '%receipt%'")
print("Sync tables:", [r[0] for r in cur.fetchall()])

# Check for any records created on 2026-10-17 across all tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
all_tables = [r[0] for r in cur.fetchall()]
print(f"\nChecking all {len(all_tables)} tables for 2026-10-17 records...")
for t in all_tables:
    cur.execute(f"PRAGMA table_info('{t}')")
    cols = [c[1] for c in cur.fetchall()]
    time_col = None
    for c in ['createdAt', 'created_at', 'timestamp']:
        if c in cols:
            time_col = c
            break
    if time_col:
        try:
            cur.execute(f"SELECT COUNT(*) FROM '{t}' WHERE {time_col} LIKE '2026-10-17%'")
            cnt = cur.fetchone()[0]
            if cnt > 0:
                print(f"Table '{t}' has {cnt} rows created on 2026-10-17")
                cur.execute(f"SELECT * FROM '{t}' WHERE {time_col} LIKE '2026-10-17%' LIMIT 3")
                sample_cols = [d[0] for d in cur.description]
                for r in cur.fetchall():
                    print("  Sample:", json.dumps(dict(zip(sample_cols, r)), default=str))
        except Exception as e:
            pass

con.close()
