with open("/data/project/machtsinn/replica.my.cnf") as f:
    lines = f.readlines()
    db_passwd = lines[2].split()[-1]
    db_user = lines[1].split()[-1]

db_host = "tools.db.svc.eqiad.wmflabs"
db_name = db_user + "__machtsinn"
db_table_main = "matches"
db_table_texts = "labels"
