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
  var data = []
  var promise = null
  var row = null
  var previous = null
  var lang = 1860
  var langcode = 'en'
  var cache = {}
  var editmode = false

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
          data = data.concat(JSON.parse(xhttp.response))
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
  var show = function (state, row, labels) {
    var element = document.getElementById(state)
    element.style.display = 'block'
    element.getElementsByClassName('lemma')[0].textContent = row[0]
    element.getElementsByClassName('lexcat')[0].textContent = labels[0]
    if (labels[1] !== null) {
      element.getElementsByClassName('genus')[0].textContent = labels[1]
      element.getElementsByClassName('joiner')[0].style.display = 'inline'
      element.getElementsByClassName('genus')[0].style.display = 'inline'
    } else {
      element.getElementsByClassName('genus')[0].style.display = 'none'
      element.getElementsByClassName('joiner')[0].style.display = 'none'
    }
    element.getElementsByClassName('description')[0].textContent = row[4]
    element.getElementsByClassName('description')[0].href =
      'https://www.wikidata.org/wiki/Q' + row[1]
    element.getElementsByClassName('lemma')[0].href =
      'https://www.wikidata.org/wiki/Lexeme:L' + row[2]
  }

  /**
    * Show the last successfully saved match
    */
  var showLast = function () {
    var element = document.getElementById('previous')
    element.getElementsByClassName('message')[0].textContent = 'Saved:'
    const oldlabels = [cache[previous[5]], cache[previous[6]]]
    show('previous', previous, oldlabels)
  }

  /**
    * Display the uppermost potential match from the queue
    */
  var showCurrent = function () {
    if (data.length === 0) {
      document.getElementById('message').textContent = 'No more potential matches for this language.'
      document.getElementById('message').style.display = 'block'
      document.getElementById('current').style.display = 'none'
      return
    }
    row = data.pop()
    const p1 = getLabelCached(row[5])
    const p2 = getLabelCached(row[6])
    Promise.all([p1, p2]).then(function (labels) {
      show('current', row, labels)
    })
  }

  var startEditMode = function () {
    if (!editmode) {
      document.getElementById('descriptionInput').value = row[4]
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
      row[4] = document.getElementById('descriptionInput').value
      document.getElementById('current-description')
        .getElementsByClassName('description')[0].textContent = row[4]
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
    if (data.length === 0) {
      promise.then(showCurrent)
    } else {
      showCurrent()
    }
    if (data.length < 4) {
      promise = load()
    }
  }

  /**
    * Send the current match as correct match to the app, so that the app adds
    * the match in Wikidata.
    */
  var send = function () {
    var data = new FormData()
    var current = row
    data.append('QID', current[1])
    data.append('LID', current[2])
    data.append('lang', current[3])
    data.append('gloss', current[4])
    return new Promise(function (resolve, reject) {
      var xhttp = new XMLHttpRequest()
      xhttp.open('POST', './save', true)
      xhttp.onload = function () {
        if (xhttp.status === 200) {
          previous = current
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
    send().then(showLast)
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
    var current = row
    next()
    return new Promise(function (resolve, reject) {
      var data = new FormData()
      data.append('QID', current[1])
      data.append('LID', current[2])
      var xhttp = new XMLHttpRequest()
      xhttp.open('POST', './reject', true)
      xhttp.onload = function () {
        if (xhttp.status === 200) {
          resolve()
        } else {
          reject(Error(xhttp.response))
        }
      }
      xhttp.send(data)
    })
  }

  /**
    * Set up the game and initially fill the queue of potential matches
    */
  var init = function () {
    data = []
    cache = []
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

  return {
    init: init,
    get: function () {
      return data
    },
    show: showCurrent,
    buttonpressed: next,
    getlabel: getLabelCached
  }
})()

document.addEventListener('DOMContentLoaded', function () {
  main.init()
})
