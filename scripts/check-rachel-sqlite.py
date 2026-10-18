import sqlite3
import json

con = sqlite3.connect('/home/ese/tfhc-production/data/operational.db')
cur = con.cursor()

cur.execute("SELECT * FROM members WHERE userId = 'ccbca25c-5237-431f-a35c-8eb1b3198e70'")
rows = cur.fetchall()
print(f"Members for Rachel in SQLite: {len(rows)}")
for r in rows:
    cols = [d[0] for d in cur.description]
    print(json.dumps(dict(zip(cols, r)), default=str))

cur.execute("SELECT * FROM approved_members WHERE email LIKE '%akomolede%'")
for r in cur.fetchall():
    cols = [d[0] for d in cur.description]
    print("ApprovedMember in SQLite:", json.dumps(dict(zip(cols, r)), default=str))

con.close()
