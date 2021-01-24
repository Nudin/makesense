# -*- coding: utf-8 -*-
#
# This file is part of MachtSinn
# This file is based on the Toolforge flask WSGI tutorial
#
# Copyright (C) 2019 Michael Schönitzer, Bryan Davis and contributors
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

import json
import os
import urllib

import flask
import LexData
import requests
import yaml
from flask import request
from flask.logging import create_logger

import mwoauth
from dbconf import db_host, db_name, db_passwd, db_user
from flask_mysqldb import MySQL
from requests_oauthlib import OAuth1

app = flask.Flask(__name__)

log = create_logger(app)

app.config["MYSQL_HOST"] = db_host
app.config["MYSQL_USER"] = db_user
app.config["MYSQL_PASSWORD"] = db_passwd
app.config["MYSQL_DB"] = db_name
db = MySQL(app)

languages = {"Q188": "de"}

with app.app_context():
    cursor = db.connection.cursor()
    cursor.execute(
        """
        SELECT lang, code
        FROM languages
        """
    )
    results = cursor.fetchall()
    languages = {"Q" + str(k): v for k, v in results}
    cursor.close()

wdqurl = "https://query.wikidata.org/sparql?format=json&query="
wdapiurl = "https://www.wikidata.org/w/api.php"

# Load configuration from YAML file
__dir__ = os.path.dirname(__file__)
app.config.update(yaml.safe_load(open(os.path.join(__dir__, "config.yaml"))))
consumer_token = mwoauth.ConsumerToken(
    app.config["CONSUMER_KEY"], app.config["CONSUMER_SECRET"]
)


def runquery(query):
    url = wdqurl + urllib.parse.quote_plus(query)
    r = requests.get(url)
    if r.status_code == 200:
        return r.json()["results"]
    else:
        return None


def get_tokens(tokentype, auth):
    params = {"action": "query", "format": "json", "meta": "tokens", "type": tokentype}
    req = requests.get(wdapiurl, params=params, auth=auth)
    if req.status_code != 200:
        raise Exception("Unknown API-error")
    result = req.json()
    if "error" in result:
        raise Exception("API-error", result["error"])
    token = result["query"]["tokens"][tokentype + "token"]
    return token


@app.route("/")
def index():
    cursor = db.connection.cursor()
    lang_arg = request.args.get("lang")
    if lang_arg is None:
        lang_code = request.headers.get("Accept-Language", "en")[:2]
        cursor.execute(
            """SELECT languages.code, languages.lang
            from matches join languages
            on matches.lang = languages.lang
            where status = %s or languages.code = %s
            GROUP BY languages.lang
            ORDER BY languages.code;""",
            (0, lang_code),
        )
        languages = cursor.fetchall()
        lang_id = [l[1] for l in languages if l[0] == lang_code][0]
    else:
        lang_id = int(lang_arg)
        cursor.execute(
            """SELECT languages.code, languages.lang
            from matches join languages
            on matches.lang = languages.lang
            where status = %s or languages.lang = %s
            GROUP BY languages.lang
            ORDER BY languages.code;""",
            (0, lang_id),
        )
        languages = cursor.fetchall()
        lang_code = [l[0] for l in languages if l[1] == lang_id][0]
    cursor.close()
    username = flask.session.get("username", None)
    return flask.render_template(
        "index.html",
        username=username,
        languages=languages,
        currentlang=lang_id,
        currentlangid=lang_code,
    )


@app.route("/getcandidates")
def getcandidates():
    lang = int(request.args.get("lang", 1860))
    number = int(request.args.get("number", 10))
    cursor = db.connection.cursor()
    cursor.execute(
        """
        SELECT lemma, matches.QID, matches.LID, matches.lang, gloss, category, genus
        FROM matches
        JOIN labels
            on matches.QID = labels.QID and matches.lang = labels.lang
        JOIN lexfeatures
            on matches.LID = lexfeatures.LID
        WHERE
            status = 0 and matches.lang = %s
        ORDER BY RAND()
        LIMIT %s
        """,
        (lang, number),
    )
    results = cursor.fetchall()
    cursor.close()
    return json.dumps(results)


@app.route("/reject", methods=["POST"])
def reject():
    lid = "L" + request.form.get("LID")
    qid = "Q" + request.form.get("QID")

    # Update DB status
    cursor = db.connection.cursor()
    cursor.execute(
        """
        UPDATE
        matches
        SET status = -1
        WHERE QID = %s and LID = %s
        """,
        (qid[1:], lid[1:]),
    )
    cursor.close()
    db.connection.commit()
    return "Done!"


@app.route("/save", methods=["POST"])
def save():
    lid = "L" + request.form.get("LID")
    qid = "Q" + request.form.get("QID")
    lang = "Q" + request.form.get("lang")
    glosses = {
        key[6:]: gloss for key, gloss in request.form.items() if key[:6] == "gloss-"
    }
    log.info("%s %s %s %s", lid, qid, lang, glosses)

    # Get token and auth
    access_token = flask.session["access_token"]
    auth1 = OAuth1(
        consumer_token.key,
        client_secret=consumer_token.secret,
        resource_owner_key=access_token["key"],
        resource_owner_secret=access_token["secret"],
    )
    token = get_tokens("csrf", auth1)
    username = flask.session.get("username", None)
    repo = LexData.WikidataSession(username=username, token=token, auth=auth1)
    repo.maxlag = 17

    # Edit – if possible
    L = LexData.Lexeme(repo, lid)
    for sense in L.senses:
        claims = sense.claims.get("P5137")
        if claims and claims[0].value["id"] == qid:
            cursor = db.connection.cursor()
            cursor.execute(
                """
                UPDATE
                matches
                SET status = 2
                WHERE QID = %s and LID = %s
                """,
                (qid[1:], lid[1:]),
            )
            cursor.close()
            db.connection.commit()
            return "Sense already existing", 409
    # TODO: check if this can be removed
    if lang not in languages:
        return "Error. Language not supported yet!", 409
    claims = {"P5137": [qid]}
    try:
        _ = L.createSense(glosses, claims)
    except PermissionError as error:
        log.exception(error)
        return "You are not permitted to do this action!", 403

    # Update DB status
    cursor = db.connection.cursor()
    cursor.execute(
        """
        UPDATE
        matches
        SET status = 1
        WHERE QID = %s and LID = %s
        """,
        (qid[1:], lid[1:]),
    )
    cursor.close()
    db.connection.commit()
    return "Done!"


@app.route("/statistics", methods=["GET"])
def statistics():
    cursor = db.connection.cursor()
    cursor.execute(
        """SELECT languages.code, count(*), 
        timestamp  
        from matches join languages
        on matches.lang = languages.lang
        where status = %s
        GROUP BY languages.lang
        ORDER BY COUNT(*) DESC;""",
        (1,),
    )
    added = cursor.fetchall()
    try:
        added_ts = max([row[2] for row in added]) 
    except (ValueError, TypeError) as e:
        most_recent = None
        print(e)
    else:
        most_recent =  added_ts.strftime('%c')
    cursor.execute(
        """SELECT languages.code, count(*)
        from matches join languages
        on matches.lang = languages.lang
        where status = %s
        GROUP BY languages.lang
        ORDER BY COUNT(*) DESC;""",
        (-1,),
    )
    rejected = cursor.fetchall()
    cursor.execute(
        """SELECT languages.code, count(*)
        from matches join languages
        on matches.lang = languages.lang
        where status = %s
        GROUP BY languages.lang
        ORDER BY COUNT(*) DESC;""",
        (0,),
    )
    todo = cursor.fetchall()
    cursor.close()
    username = flask.session.get("username", None)
    return flask.render_template(
        "statistics.html", most_recent=most_recent, added=added, todo=todo, rejected=rejected, username=username
    )


@app.route("/login")
def login():
    """Initiate an OAuth login.

    Call the MediaWiki server to get request secrets and then redirect the
    user to the MediaWiki server to sign the request.
    """
    try:
        redirect, request_token = mwoauth.initiate(
            app.config["OAUTH_MWURI"], consumer_token, callback="https://machtsinn.toolforge.org/oauth-callback"
        )
    except Exception:
        log.exception("mwoauth.initiate failed")
        return flask.redirect(flask.url_for("index"))
    else:
        flask.session["request_token"] = dict(zip(request_token._fields, request_token))
        return flask.redirect(redirect)


@app.route("/oauth-callback")
def oauth_callback():
    """OAuth handshake callback."""
    if "request_token" not in flask.session:
        flask.flash(u"OAuth callback failed. Are cookies disabled?")
        return flask.redirect(flask.url_for("index"))

    try:
        log.warning(flask.request.query_string.decode("ascii"))
        access_token = mwoauth.complete(
            app.config["OAUTH_MWURI"],
            consumer_token,
            mwoauth.RequestToken(**flask.session["request_token"]),
            flask.request.query_string,
        )

        identity = mwoauth.identify(
            app.config["OAUTH_MWURI"], consumer_token, access_token
        )
    except Exception:
        log.exception("OAuth authentication failed")

    else:
        flask.session["access_token"] = dict(zip(access_token._fields, access_token))
        flask.session["username"] = identity["username"]

    return flask.redirect(flask.url_for("index"))


@app.route("/logout")
def logout():
    """Log the user out by clearing their session."""
    flask.session.clear()
    return flask.redirect(flask.url_for("index"))
