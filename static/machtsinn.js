/*
  * This file is part of MachtSinn
  *
  * Copyright (C) 2019 Michael Schönitzer and contributors
  *
  * This program is free software: you can redistribute it and/or modify it
  * under the terms of the GNU General Public License as published by the Free
  * Software Foundation, either version 3 of the License, or (at your option)
  * any later version.
  *
  * This program is distributed in the hope that it will be useful, but WITHOUT
  * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
  * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
  * more details.
  *
  * You should have received a copy of the GNU General Public License along
  * with this program.  If not, see <http://www.gnu.org/licenses/>.
  */
var main = (function () {
  var queue = []
  var promise = null
  var current = null
  var lastMatch = null
  var lang = 1860
  var langcode = 'en'
  var cache = {}
  var editmode = false

  class PotentialMatch {
    constructor (row) {
      this.lexeme = row[0]
      this.qid = row[1]
      this.lid = row[2]
      this.lang = row[3]
      this.gloss = row[4]
      this.lexcat = row[5]
      this.genus = row[6]
    }

    equal (other) {
      return (this.lid === other.lid && this.qid === other.qid)
    }

    notEqual (other) {
      return !this.equal(other)
    }
  }

  /**
    * Request a number of potential matches from the app's API and save them in
    * the queue
    */
  var load = function () {
    return new Promise(function (resolve, reject) {
      var xhttp = new XMLHttpRequest()
      xhttp.open('GET', './getcandidates?lang=' + lang, true)
      xhttp.onload = function () {
        if (xhttp.status === 200) {
          var rows = JSON.parse(xhttp.response)
          var newElements = rows.map(function (r) { return new PotentialMatch(r) })
          queue = queue.concat(newElements)
          resolve()
        } else {
          reject(Error(xhttp.response))
        }
      }
      xhttp.send()
    })
  }

  /**
    * Get the label of an item via Wikidata's API
    *
    * qid: qid without 'Q'
    * langcode: Wikimedia langcode ('en', 'de'…)
    */
  function getLabel (qid, langcode) {
    qid = 'Q' + qid
    return new Promise(function (resolve, reject) {
      var xhttp = new XMLHttpRequest()
      xhttp.onreadystatechange = function () {
        if (this.readyState === 4 && this.status === 200) {
          const res = JSON.parse(this.responseText)
          resolve(res.entities[qid].labels[langcode].value)
        }
      }
      xhttp.open('GET', 'https://www.wikidata.org/w/api.php?' +
                        'origin=*&action=wbgetentities&format=json' +
                        '&ids=' + qid + '&props=labels&languages=' + langcode, true)
      xhttp.setRequestHeader('Content-type', 'application/json')
      xhttp.send()
    })
  }

  /**
    * Wrapper around getLabel with a cache to avoid unnecessary requests
    */
  async function getLabelCached (qid) {
    if (qid === null) {
      return null
    }
    if (qid in cache) {
      return cache[qid]
    } else {
      const value = await getLabel(qid, langcode)
      cache[qid] = value
      return value
    }
  }

  /**
    * Display the given potential match
    */
  var show = function (state, match, labels) {
    var element = document.getElementById(state)
    element.style.display = 'block'
    element.getElementsByClassName('lemma')[0].textContent = match.lexeme
    element.getElementsByClassName('lexcat')[0].textContent = labels.lexcat
    if (labels.genus) {
      element.getElementsByClassName('genus')[0].textContent = labels.genus
      element.getElementsByClassName('joiner')[0].style.display = 'inline'
      element.getElementsByClassName('genus')[0].style.display = 'inline'
    } else {
      element.getElementsByClassName('genus')[0].style.display = 'none'
      element.getElementsByClassName('joiner')[0].style.display = 'none'
    }
    element.getElementsByClassName('description')[0].textContent = match.gloss
    element.getElementsByClassName('description')[0].href =
      'https://www.wikidata.org/wiki/Q' + match.qid
    element.getElementsByClassName('lemma')[0].href =
      'https://www.wikidata.org/wiki/Lexeme:L' + match.lid
  }

  /**
    * Show the last successfully saved match
    */
  var showLast = function () {
    var element = document.getElementById('previous')
    element.getElementsByClassName('message')[0].textContent = 'Saved:'
    const oldlabels = [cache[lastMatch.lexcat], cache[lastMatch.genus]]
    show('previous', lastMatch, oldlabels)
  }

  /**
    * Display the uppermost potential match from the queue
    */
  var showCurrent = function () {
    if (queue.length === 0) {
      document.getElementById('message').textContent = 'No more potential matches for this language.'
      document.getElementById('message').style.display = 'block'
      document.getElementById('current').style.display = 'none'
      return
    }
    current = queue.pop()
    const p1 = getLabelCached(current.lexcat)
    const p2 = getLabelCached(current.genus)
    Promise.all([p1, p2]).then(function (results) {
      var labels = { lexcat: results[0], genus: results[1] }
      show('current', current, labels)
    })
  }

  var startEditMode = function () {
    if (!editmode) {
      document.getElementById('descriptionInput').value = current.gloss
      document.getElementById('current-description').style.display = 'none'
      document.getElementById('descriptionInput').style.display = 'inline'
      document.getElementById('editbtn').style.display = 'none'
      document.getElementById('commitbtn').style.display = 'inline'
      document.getElementById('editwarning').style.display = 'block'
      editmode = true
    }
  }

  var leaveEditMode = function () {
    if (editmode) {
      current.gloss = document.getElementById('descriptionInput').value
      document.getElementById('current-description')
        .getElementsByClassName('description')[0].textContent = current.gloss
      document.getElementById('current-description').style.display = 'inline'
      document.getElementById('descriptionInput').style.display = 'none'
      document.getElementById('editbtn').style.display = 'inline'
      document.getElementById('commitbtn').style.display = 'none'
      document.getElementById('editwarning').style.display = 'none'
      editmode = false
    }
  }

  /**
    * Show next potential match and refill queue if necessary
    */
  var next = function () {
    // Due to the asynchronous queue refilling there might be copies of the old
    // match in the queue – therefore remove them
    queue = queue.filter(m => current.notEqual(m))

    if (queue.length === 0) {
      promise.then(showCurrent)
    } else {
      showCurrent()
    }
    if (queue.length < 4) {
      promise = load()
    }
  }

  /**
    * Send the current match as correct or false match to the app.
    *
    * If success is true: the app adds the match to Wikidata
    * If success is false: never show the (wrong) match again.
    */
  var send = function (success) {
    var url = success ? './save' : './reject'
    var data = new FormData()
    var matchToSend = current
    data.append('QID', matchToSend.qid)
    data.append('LID', matchToSend.lid)
    data.append('lang', matchToSend.lang)
    data.append('gloss', matchToSend.gloss)
    return new Promise(function (resolve, reject) {
      var xhttp = new XMLHttpRequest()
      xhttp.open('POST', url, true)
      xhttp.onload = function () {
        if (xhttp.status === 200) {
          if (success) { lastMatch = matchToSend }
          resolve()
        } else {
          reject(Error(xhttp.response))
        }
      }
      xhttp.send(data)
    })
  }

  /**
    * Send match as 'correct' to the app and show next potential match
    */
  var sendAndNext = function () {
    leaveEditMode()
    send(true).then(showLast)
    next()
  }

  /**
    * Skip match and show next
    */
  var skipAndNext = function () {
    leaveEditMode()
    next()
  }

  /**
    * Send match as 'wrong' to the app and show next potential match
    */
  var rejectAndNext = function () {
    leaveEditMode()
    send(false)
    next()
  }

  /**
    * Set up the game and initially fill the queue of potential matches
    */
  var init = function () {
    queue = []
    cache = {}
    var langsel = document.getElementById('languageselector')
    lang = langsel.value
    langcode = langsel.options[langsel.selectedIndex].innerHTML

    langsel.onchange = function () {
      lang = langsel.value
      langcode = langsel.options[langsel.selectedIndex].innerHTML
      history.pushState(lang, '', window.location.pathname + '?lang=' + lang)
      init()
    }

    try {
      var nextbtn = document.getElementById('nextbtn')
      nextbtn.onclick = skipAndNext
      var sndbtn = document.getElementById('savebtn')
      sndbtn.onclick = sendAndNext
      var rejectbtn = document.getElementById('rejectbtn')
      rejectbtn.onclick = rejectAndNext
      var editbtn = document.getElementById('editbtn')
      editbtn.onclick = startEditMode
      var commitbtn = document.getElementById('commitbtn')
      commitbtn.onclick = leaveEditMode
    } catch (e) {} // Buttons don't exist if user isn't logged in

    // Load and display first matches
    load().then(function () {
      showCurrent()
    })
  }

  document.addEventListener('keydown', function (event) {
    if (editmode) {
      return
    }
    if (event.key === 'n') {
      document.getElementById('rejectbtn').click()
    } else if (event.key === 's') {
      document.getElementById('nextbtn').click()
    } else if (event.key === 'm') {
      document.getElementById('savebtn').click()
    }
  })

  return {
    init: init,
    get: function () {
      return queue
    },
    show: showCurrent,
    buttonpressed: next,
    getlabel: getLabelCached
  }
})()

document.addEventListener('DOMContentLoaded', function () {
  main.init()
})
