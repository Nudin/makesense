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
  var glossLanguages = []

  class PotentialMatch {
    constructor (row) {
      this.lexeme = row[0]
      this.qid = row[1]
      this.lid = row[2]
      this.lang = row[3]
      this.gloss = {}
      this.gloss[langcode] = row[4]
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
    * Get the description of an item via Wikidata's API
    *
    * qid: qid without 'Q'
    * langcode: Wikimedia langcode ('en', 'de'…)
    */
  function getDescription (qid, langcode) {
    qid = 'Q' + qid
    return new Promise(function (resolve, reject) {
      var xhttp = new XMLHttpRequest()
      xhttp.onreadystatechange = function () {
        if (this.readyState === 4 && this.status === 200) {
          const res = JSON.parse(this.responseText)
          if (langcode in res.entities[qid].descriptions) {
            resolve(res.entities[qid].descriptions[langcode].value)
          } else {
            reject(new Error('No description'))
          }
        }
      }
      xhttp.open('GET', 'https://www.wikidata.org/w/api.php?' +
                        'origin=*&action=wbgetentities&format=json' +
                        '&ids=' + qid + '&props=descriptions&languages=' + langcode, true)
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

  function getAdditionalGlosses (currentMatch) {
    return glossLanguages.map(function (alang) {
      if (alang === langcode) { return new Promise(resolve => resolve()) }
      return getDescription(currentMatch.qid, alang).then(function (value) {
        currentMatch.gloss[alang] = value
      }, function (error) { /* No description available, ignore this language */ })
    })
  }

  /**
    * Generate a prefix for the lexeme.
    *
    * This prefix depends on the conventions of the language, therefore only a few are defined here.
    */
  var getPrefix = function (match) {
    if (langcode === 'en') {
      if (match.lexcat === 24905) {
        return 'to'
      }
    }
    if (langcode === 'de') {
      if (match.genus === 499327) {
        return 'Der'
      } else if (match.genus === 1775415) {
        return 'Die'
      } else if (match.genus === 1775461) {
        return 'Das'
      }
    }
    return ''
  }

  /**
    * Display the given potential match
    */
  var show = function (state, match, labels) {
    var block = document.getElementById(state)
    block.style.display = 'block'
    block.querySelector('.prefix').textContent = getPrefix(match)
    block.querySelector('.lemma').textContent = match.lexeme
    block.querySelector('.lexcat').textContent = labels.lexcat
    if (labels.genus) {
      block.querySelector('.genus').textContent = labels.genus
      block.querySelector('.joiner').style.display = 'inline'
      block.querySelector('.genus').style.display = 'inline'
    } else {
      block.querySelector('.genus').style.display = 'none'
      block.querySelector('.joiner').style.display = 'none'
    }
    block.querySelector('.lemma').href =
      'https://www.wikidata.org/wiki/Lexeme:L' + match.lid
    if (state === 'current') {
      glossLanguages.forEach(function (alang) {
        var desc = block.querySelector('#description-block-' + alang)
        if (alang in match.gloss) {
          desc.style.display = 'block'
          desc.querySelector('.description').textContent = match.gloss[alang]
          desc.querySelector('.description').href =
    'https://www.wikidata.org/wiki/Q' + match.qid
        } else {
          desc.style.display = 'none'
        }
      })
    } else {
      block.querySelector('.description').textContent = match.gloss[langcode]
      block.querySelector('.description').href =
    'https://www.wikidata.org/wiki/Q' + match.qid
    }
  }

  var addNewGlossLang = function (newlang) {
    const template = document.querySelector('#further-descriptions')
    const newElement = document.importNode(template.content, true)
    newElement.firstElementChild.style.display = 'none'
    newElement.firstElementChild.id = 'description-block-' + newlang
    newElement.querySelector('.langcode').textContent = newlang
    document.getElementById('descriptions').append(newElement)
  }

  /**
    * Show the last successfully saved match
    */
  var showLast = function () {
    document.getElementById('previous-message').textContent = 'Saved:'
    const oldlabels = { lexcat: cache[lastMatch.lexcat], genus: cache[lastMatch.genus] }
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
    const p3 = getAdditionalGlosses(current)
    Promise.all([p1, p2].concat(p3)).then(function (results) {
      var labels = { lexcat: results[0], genus: results[1] }
      show('current', current, labels)
    })
  }

  var startEditMode = function (click) {
    if (!editmode) {
      var block = click.srcElement.parentElement
      var desclang = block.id.slice('description-block-'.length)
      block.querySelector('.descriptionInput').value = current.gloss[desclang]
      block.querySelector('.description-line').style.display = 'none'
      block.querySelector('.descriptionInput').style.display = 'inline'
      block.querySelector('.editbtn').style.display = 'none'
      block.querySelector('.commitbtn').style.display = 'inline'
      document.getElementById('editwarning').style.display = 'block'
      editmode = true
    }
  }

  var leaveEditMode = function (click) {
    if (editmode) {
      var block = click.srcElement.parentElement
      var desclang = block.id.slice('description-block-'.length)
      current.gloss[desclang] = block.querySelector('.descriptionInput').value
      block.querySelector('.description').textContent = current.gloss[desclang]
      block.querySelector('.description-line').style.display = 'inline'
      block.querySelector('.descriptionInput').style.display = 'none'
      block.querySelector('.editbtn').style.display = 'inline'
      block.querySelector('.commitbtn').style.display = 'none'
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
    glossLanguages.forEach(function (lang) {
      if (lang in matchToSend.gloss) {
        data.append('gloss-' + lang, matchToSend.gloss[lang])
      }
    })
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

  var updateLangList = function () {
    const oldLangStr = glossLanguages.join(',')
    const newLangStr = window.prompt('List of language in those you want to add the glosses. Comma separated language codes (Example: "de,en,fr")', oldLangStr)
    if (newLangStr === '') { window.alert('List cannot be empty'); return }
    const newList = newLangStr.split(/ ?, ?/)
    if (newList.sort().join() === glossLanguages.sort().join()) { return }
    document.querySelectorAll('.additionaldesc').forEach(x => x.remove())
    newList.forEach(function (newLang) {
      if (newLang !== langcode) {
        addNewGlossLang(newLang)
      }
    })
    glossLanguages = newList
    init()
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
    if (glossLanguages.length === 0) {
      glossLanguages = [langcode]
    }

    langsel.onchange = function () {
      var oldlangcode = langcode
      lang = langsel.value
      langcode = langsel.options[langsel.selectedIndex].innerHTML
      history.pushState(lang, '', window.location.pathname + '?lang=' + lang)
      document.getElementById('description-block-' + oldlangcode).id = 'description-block-' + langcode
      document.querySelectorAll('.additionaldesc').forEach(x => x.remove())
      glossLanguages = []
      init()
    }

    document.getElementById('addLang').onclick = updateLangList
    try {
      var nextbtn = document.getElementById('nextbtn')
      nextbtn.onclick = skipAndNext
      var sndbtn = document.getElementById('savebtn')
      sndbtn.onclick = sendAndNext
      var rejectbtn = document.getElementById('rejectbtn')
      rejectbtn.onclick = rejectAndNext
    } catch (e) {} // Buttons don't exist if user isn't logged in
    document.querySelectorAll('.editbtn').forEach(function (editbtn) {
      editbtn.onclick = startEditMode
    })
    document.querySelectorAll('.commitbtn').forEach(function (commitbtn) {
      commitbtn.onclick = leaveEditMode
    })

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
