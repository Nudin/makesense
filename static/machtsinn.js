var main = (function () {
  var data = []
  var promise = null
  var row = null
  var previous = null
  var lang = 188

  var load = function () {
    return new Promise(function (resolve, reject) {
      var xhttp = new XMLHttpRequest()
      xhttp.open('GET', './getcandidates?lang=' + lang, true)
      xhttp.onload = function () {
        if (xhttp.status === 200) {
          resolve(JSON.parse(xhttp.response))
        } else {
          reject(Error(xhttp.response))
        }
      }
      xhttp.send()
    })
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
      promise.then(function (newdata) {
        data = data.concat(newdata)
        showCurrent()
      })
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
    send().then(function () {
      showLast()
    })
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

  return {
    init: function () {
      var parameters = new URLSearchParams(window.location.search)
      lang = parameters.get('lang') || 188
      load().then(function (newdata) {
        data = data.concat(newdata)
        showCurrent()
      })
      var nextbtn = document.getElementById('nextbtn')
      nextbtn.onclick = next
      var sndbtn = document.getElementById('savebtn')
      sndbtn.onclick = sendAndNext
      var rejectbtn = document.getElementById('rejectbtn')
      rejectbtn.onclick = rejectAndNext
    },
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
