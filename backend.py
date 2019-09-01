#!/usr/bin/env python3
from typing import List, Tuple

import mysql.connector
import requests

from dbconf import *


# Run a query against a web-api
def runquery(url, params={}, session=requests):
    headers = {"User-Agent": user_agent}
    r = session.get(url, headers=headers, params=params)
    if r.status_code == 200:
        return r.json()["results"]
    return None


# Run a Spaql-Query
def runSPARQLquery(query):
    return runquery(endpoint_url, params={"format": "json", "query": query})["bindings"]


endpoint_url = "https://query.wikidata.org/sparql"

user_agent = "makesense 0.0.1 by User:MichaelSchoenitzer"

with open("query.sparql") as f:
    sparql = f.read()

try:
    mydb = mysql.connector.connect(
        host=db_host,
        user=db_user,
        passwd=db_passwd,
        database=db_name,
        charset="utf8",
        use_unicode=True,
    )
except:
    mydb = mysql.connector.connect(host=db_host, user=db_user, passwd=db_passwd)

    mycursor = mydb.cursor()
    mycursor.execute("CREATE DATABASE {}".format(db_name))
    mydb = mysql.connector.connect(
        host=db_host,
        user=db_user,
        passwd=db_passwd,
        database=db_name,
        charset="utf8",
        use_unicode=True,
    )


mycursor = mydb.cursor()

mycursor.execute(
    """CREATE TABLE IF NOT EXISTS `{}` (
     `lang` INT,
     `QID` INT,
     `LID` INT,
     `Status` INT,
     PRIMARY KEY (`lang`,`QID`,`LID`)
);""".format(
        db_table_main
    )
)

mycursor.execute(
    """CREATE TABLE IF NOT EXISTS `{}` (
     `lang` INT,
     `QID` INT,
     `lemma` TEXT CHARACTER SET utf8 NOT NULL,
     `gloss` TEXT CHARACTER SET utf8 NOT NULL,
     PRIMARY KEY (`lang`,`QID`)
);""".format(
        db_table_texts
    )
)

print("Running Query…")
res = runSPARQLquery(sparql)

print("Collection results…")
sql = "INSERT IGNORE INTO {} (lang, QID, LID, Status) VALUES (%s, %s, %s, %s)".format(
    db_table_main
)
values = []
text_sql = "INSERT IGNORE INTO {} (lang, QID, lemma, gloss) VALUES (%s, %s, %s, %s)".format(
    db_table_texts
)
text_values = []
for row in res:
    lang = int(row["lang"]["value"][32:])
    lid = int(row["lexeme"]["value"][32:])
    qid = int(row["item"]["value"][32:])

    lemma = row["lemma"]["value"]
    desc = row["desc"]["value"]

    values.append((lang, qid, lid, 0))
    text_values.append((lang, lid, lemma, desc))

print("Adding {} rows to Database…".format(len(values) + len(text_values)))

try:
    mycursor.executemany(sql, values)
    mycursor.executemany(text_sql, text_values)
except:
    print(mycursor.statement)

mydb.commit()
