# -*- coding: utf-8 -*-
#
# This file is part of the Toolforge flask WSGI tutorial
#
# Copyright (C) 2017 Bryan Davis and contributors
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

import os
import urllib

import flask
import LexData
import mwoauth
import mysql.connector
import requests
import yaml
from flask import request
from requests_oauthlib import OAuth1

from dbconf import *

app = flask.Flask(__name__)
db = mysql.connector.connect(
    host=db_host, user=db_user, passwd=db_passwd, database=db_name
)

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
    username = flask.session.get("username", None)
    return flask.render_template("index.html", username=username, greeting="test")


@app.route("/getcandidates")
def getcandidates():
    lang = int(request.args.get("lang", 188))
    number = int(request.args.get("number", 10))
    cursor = db.cursor()
    cursor.execute(
        """SELECT lemma, matches.QID, LID, matches.lang, gloss FROM matches
        JOIN labels
            on matches.QID = labels.QID and matches.lang = labels.lang
        WHERE
            status = 0 and matches.lang = %s
        LIMIT %s""",
        (lang, number),
    )
    results = cursor.fetchall()
    username = flask.session.get("username", None)
    return flask.render_template("index.html", username=username, greeting=str(results))


@app.route("/save", methods=["POST"])
def save():
    lid = request.args.get("LID")
    qid = request.args.get("QID")
    gloss = request.args.get("gloss")
    access_token = flask.session["access_token"]
    auth1 = OAuth1(
        consumer_token.key,
        client_secret=consumer_token.secret,
        resource_owner_key=access_token["key"],
        resource_owner_secret=access_token["secret"],
    )
    repo = LexData.WikidataSession(token=auth1)

    L = LexData.Lexeme(repo, lid)
    if L.senses:
        pass  # FIXME
    print('Lexeme {} "{}"'.format(lid, L.lemma))

    glosses = {"de": gloss}
    claims = {"P5137": [qid]}
    try:
        _ = L.createSense(glosses, claims)
    except PermissionError:
        return "Error!"  # FIXME
    return "Done!"


@app.route("/login")
def login():
    """Initiate an OAuth login.

    Call the MediaWiki server to get request secrets and then redirect the
    user to the MediaWiki server to sign the request.
    """
    try:
        redirect, request_token = mwoauth.initiate(
            app.config["OAUTH_MWURI"], consumer_token
        )
    except Exception:
        app.logger.exception("mwoauth.initiate failed")
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
        app.logger.exception("OAuth authentication failed")

    else:
        flask.session["access_token"] = dict(zip(access_token._fields, access_token))
        flask.session["username"] = identity["username"]

    return flask.redirect(flask.url_for("index"))


@app.route("/logout")
def logout():
    """Log the user out by clearing their session."""
    flask.session.clear()
    return flask.redirect(flask.url_for("index"))
