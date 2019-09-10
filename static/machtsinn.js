var main = (function() {

  var data = [];
  var promise = null;

  var load = function() {
    return new Promise(function(resolve, reject){
      var xhttp = new XMLHttpRequest();
      xhttp.open("GET", "./getcandidates", true);
      xhttp.onload = function() {
	if (xhttp.status == 200) {
	  resolve(JSON.parse(xhttp.response));
	}
	else {
	  reject(Error(xhttp.response));
      }};
      xhttp.send();
    });
  };

  var show = function() {
    console.log("show");
    row = data.pop();
    current = document.getElementById("current");
    current.getElementsByClassName("lemma")[0].textContent = row[0];
    current.getElementsByClassName("description")[0].textContent = row[4];
    current.getElementsByClassName("QID")[0].innerHTML =
      "<a href=\"https://www.wikidata.org/wiki/Q" + row[1] + "\">Q" + row[1] + "</a>";
    current.getElementsByClassName("LID")[0].innerHTML =
      "<a href=\"https://www.wikidata.org/wiki/Lexeme:L" + row[2] + "\">L" + row[2] + "</a>";
  }

  return {
    init: function() {
      load().then(function(newdata){
	data = data.concat(newdata);
	show();
      });
    },
    get: function() {
      return data;
    },
    show: show,
    buttonpressed: function() {
      if(data.length == 0) {
	promise.then(function(newdata) {
	  data = data.concat(newdata);
	  show();
	})
      }
      else {
	show();
	}
      if(data.length < 4) {
	promise = load();
      }
    }
  };

})();

document.addEventListener('DOMContentLoaded', function(){
  main.init()
});
