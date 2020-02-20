#!/usr/bin/env python3
#
# This file is part of MachtSinn
#
# Copyright (C) 2019 Michael Schönitzer and contributors
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option)
# any later version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
# FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
# more details.
#
# You should have received a copy of the GNU General Public License along
# with this program.  If not, see <http://www.gnu.org/licenses/>.
from typing import Dict, List, Optional, Tuple

import mysql.connector
import requests

from dbconf import (
    db_host,
    db_name,
    db_passwd,
    db_table_lang_codes,
    db_table_lexemes,
    db_table_main,
    db_table_texts,
    db_user,
)

user_agent = "makesense 0.0.2 by User:MichaelSchoenitzer"


# Run a query against a web-api
def runquery(url, params={}, session=requests):
    headers = {"User-Agent": user_agent}
    r = session.get(url, headers=headers, params=params)
    if r.status_code == 200:
        return r.json()["results"]
    raise Exception("Query failed:", r.text)


# Run a Spaql-Query
def runSPARQLquery(query):
    endpoint_url = "https://query.wikidata.org/sparql"
    return runquery(endpoint_url, params={"format": "json", "query": query})["bindings"]


class MachtSinnDB:

    # This variable should be incremented every time the query is changed
    # and the database should be pruned from data that is not in the query anymore
    dataversion = 3

    def __init__(self):
        # Open SQL-Connection
        self.mydb = mysql.connector.connect(
            host=db_host,
            user=db_user,
            passwd=db_passwd,
            charset="utf8",
            use_unicode=True,
        )
        self.cursor = self.mydb.cursor()
        try:
            self.mydb.database = db_name
        except Exception:
            self.cursor.execute("CREATE DATABASE {}".format(db_name))
            self.mydb.database = db_name
        self.create_tables()

    def create_tables(self):
        self.cursor.execute(
            """CREATE TABLE IF NOT EXISTS `{}` (
             `lang` INT,
             `QID` INT,
             `LID` INT,
             `Status` INT,
             `version` INT,
             PRIMARY KEY (`lang`,`QID`,`LID`)
        );""".format(
                db_table_main
            )
        )

        self.cursor.execute(
            """CREATE TABLE IF NOT EXISTS `{}` (
             `LID` INT,
             `category` INT,
             `genus` INT,
             `version` INT,
             PRIMARY KEY (`LID`)
        );""".format(
                db_table_lexemes
            )
        )

        self.cursor.execute(
            """CREATE TABLE IF NOT EXISTS `{}` (
             `lang` INT,
             `QID` INT,
             `lemma` TEXT CHARACTER SET utf8 NOT NULL,
             `gloss` TEXT CHARACTER SET utf8 NOT NULL,
             `version` INT,
             PRIMARY KEY (`lang`,`QID`)
        );""".format(
                db_table_texts
            )
        )

        self.cursor.execute(
            """CREATE TABLE IF NOT EXISTS `{}` (
             `lang` INT,
             `code` TEXT,
             PRIMARY KEY (`lang`)
        );""".format(
                db_table_lang_codes
            )
        )

    def save_executemany(self, sql_query, values):
        try:
            self.cursor.executemany(sql_query, values)
        except Exception as e:
            print(e)
            print("Problem executing:")
            print(self.cursor.statement)

    def add_matches(self, values):
        sql = """INSERT INTO {0}
                 (lang, QID, LID, Status, version)
                 VALUES
                 (%s, %s, %s, %s, {1})
                 ON DUPLICATE KEY UPDATE version = {1}""".format(
            db_table_main, self.dataversion
        )
        self.save_executemany(sql, values)

    def add_texts(self, values):
        sql = """INSERT INTO {0}
                 (lang, QID, lemma, gloss, version)
                 VALUES
                 (%s, %s, %s, %s, {1})
                 ON DUPLICATE KEY UPDATE version = {1}""".format(
            db_table_texts, self.dataversion
        )
        self.save_executemany(sql, values)

    def add_lexeminfo(self, values):
        sql = """INSERT INTO {0}
                 (lid, category, genus, version)
                 VALUES
                 (%s, %s, %s, {1})
                 ON DUPLICATE KEY UPDATE version = {1}""".format(
            db_table_lexemes, self.dataversion
        )
        self.save_executemany(sql, values)

    def add_languages(self, langlist):
        sql = "INSERT IGNORE INTO {} (lang, code) VALUES (%s, %s)".format(
            db_table_lang_codes
        )
        self.save_executemany(sql, langlist)

    def prune_old(self):
        self.cursor.execute(
            """DELETE FROM {} WHERE version < {} and status = 0""".format(
                db_table_main, self.dataversion
            )
        )

    def get_common_languages(self) -> List:
        self.cursor.execute(
            """SELECT lang FROM matches
            WHERE status = 0
            GROUP BY lang
            HAVING count(*) > 100"""
        )
        return self.cursor.fetchall()

    def commit(self):
        self.mydb.commit()


class Match:
    def __init__(self, row: Dict):
        self.lang = int(row["lang"]["value"][32:])
        self.lid = int(row["lexeme"]["value"][32:])
        self.qid = int(row["item"]["value"][32:])

        self.lemma = row["lemma"]["value"]
        self.desc = row["desc"]["value"]

        self.cat = int(row["cat"]["value"][32:])
        try:
            self.genus = int(row["genus"]["value"][32:])
        except KeyError:
            self.genus = None

    def get_match_values(self) -> Tuple[int, int, int, int]:
        return (self.lang, self.qid, self.lid, 0)

    def get_text_values(self) -> Tuple[int, int, str, str]:
        return (self.lang, self.qid, self.lemma, self.desc)

    def get_lexeme_values(self) -> Tuple[int, int, Optional[int]]:
        return (self.lid, self.cat, self.genus)


db = MachtSinnDB()
# Run Query #
print("Running queries…")

queries = [
    #    "queries/default.sparql",
    #    "queries/en.sparql",
    "queries/withoutdescriptions.sparql",
]
for filename in queries:
    with open(filename) as f:
        sparql_query = f.read()

    if "# REPLACE_ME" in sparql_query:
        lang_filter = ""
        for lang in db.get_common_languages():
            print("Create filter for", lang[0])
            lang_filter += "FILTER(?lang != wd:Q{}).".format(lang[0])
        sparql_query.replace("# REPLACE_ME", lang_filter)
        print(lang_filter)

    print("Running query", filename)
    res = runSPARQLquery(sparql_query)
    print("Collect results…")
    num_matches = len(res)
    matches = [Match(row) for row in res]
    print("Adding {} rows to Database…".format(3 * num_matches))
    db.add_matches(map(Match.get_match_values, matches))
    db.add_texts(map(Match.get_text_values, matches))
    db.add_lexeminfo(map(Match.get_lexeme_values, matches))
    db.commit()

# Query for the wikimedia language codes #
with open("queries/langcodes.sparql") as f:
    sparql = f.read()

res = runSPARQLquery(sparql)
langlist = [(row["lang"]["value"][32:], row["code"]["value"]) for row in res]

db.add_languages(langlist)
db.commit()

# Delete old entries #
db.prune_old()
db.commit()
