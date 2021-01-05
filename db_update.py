# connect to db as before,. 
from dbconf import (db_host, db_name, db_passwd, db_user)
import mysql.connector
mydb = mysql.connector.connect(
        host=db_host,
        user=db_user,
        passwd=db_passwd, 
        database=db_name)

cursor = mydb.cursor()
qry = "ALTER TABLE matches add column timestamp DATETIME NULL"

try:
    cursor.execute(qry)
except Exception as e:
    print(e)
else:
    print('new column added')
    mydb.commit()

