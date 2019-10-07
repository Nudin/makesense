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
  var langcode = "en"
  var cache = {}

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

  function getLabel(qid, langcode) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
         if (this.readyState == 4 && this.status == 200) {
             data = JSON.parse(this.responseText);
             console.log(data.entities[qid].labels[langcode].value);
         }
    };
    xhttp.open("GET", "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" +qid+ "&props=labels&languages=" + langcode, true);
    xhttp.setRequestHeader("Content-type", "application/json");
    xhttp.send();
  }

  function getLabelCached(qid) {
    if ( qid in cache ) {
      return cache[qid];
    }
    else {
      value = getLabel(qid, langcode)
      cache[qid] = value
      return value
    }
  }

  var show = function (state, row) {
    var element = document.getElementById(state)
    element.getElementsByClassName('lemma')[0].textContent = row[0]
    element.getElementsByClassName('description')[0].textContent = row[4]
    element.getElementsByClassName('QID')[0].innerHTML =
      '<a href="https://www.wikidata.org/wiki/Q' +
      row[1] +
      '">Q' +
      row[1] +
      '</a>'
    element.getElementsByClassName('LID')[0].innerHTML =
      '<a href="https://www.wikidata.org/wiki/Lexeme:L' +
      row[2] +
      '">L' +
      row[2] +
      '</a>'
  }

  var showLast = function () {
    var element = document.getElementById('previous')
    element.getElementsByClassName('message')[0].textContent = 'Saved:'
    show('previous', previous)
  }

  var showCurrent = function () {
    row = data.pop()
    show('current', row)
  }

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

  var sendAndNext = function () {
    send().then(showLast)
    next()
  }

  var rejectAndNext = function () {
    next()
    return new Promise(function (resolve, reject) {
      var data = new FormData()
      var current = row
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

  var init = function () {
    data = []
    cache = []
    var parameters = new URLSearchParams(window.location.search)
    lang = parameters.get('lang') || 1860
    load().then(function () {
      showCurrent()
    })
    var nextbtn = document.getElementById('nextbtn')
    nextbtn.onclick = next
    var sndbtn = document.getElementById('savebtn')
    sndbtn.onclick = sendAndNext
    var rejectbtn = document.getElementById('rejectbtn')
    rejectbtn.onclick = rejectAndNext

    var langsel = document.getElementById('languageselector')
    langcode = langsel.text
    langsel.onchange = function () {
      lang = langsel.value
      langcode = langsel.text
      history.pushState(lang, '', window.location.pathname + '?lang=' + lang)
      init()
    }
  }

  return {
    init: init,
    get: function () {
      return data
    },
    show: showCurrent,
    buttonpressed: next
  }
})()

document.addEventListener('DOMContentLoaded', function () {
  main.init()
})
