// Jiffy: a lightweight media controller
//   for multiple sequential media files with timed events
// github.com/chadananda/jiffy
//

// *********************
// Internal functionality
// *********************
function Jiffy (HTMLMediaElement, timingArray) {
  this.player = HTMLMediaElement;
  this.eventQue = []; // sequential event tokens  {start, end, fileref}
  this.fileList = []; // sequential file tokens {url, fileref, start, len, end}
  this.eventRef = {}; // given id, get filelist ref and eventque ref
  this.onStartEvent = function(); // start event
  this.onEndEvent = function(); // end event
  this.currentID = -1;
  this.currentFileRef = -1;
  // player events causing our event checker to start
  this.player.addEventListener("play", eventCheck);
  this.player.addEventListener("playing", eventCheck);
  this.player.addEventListener("seeked", eventCheck);
  // player events causing our event checker to stop
  this.player.addEventListener("pause", eventCheckCancel);
  this.player.addEventListener("suspend", eventCheckCancel);
  this.player.addEventListener("abort", eventCheckCancel);

  // timingArray should be an array of objects like:
  /* {
      "url": "http://media_file_url.mp4",
      "length_seconds": 4542.51,
      "times": {
        "_ub6": {"start": 0.000, "end": 1.000 },
        "_ub7": {"start": 1.000, "end": 1.280 },
        "_ub8": {"start": 1.280, "end": 2.040 },
        "_ub9": {"start": 2.040, "end": 2.160 }
    } }

    TODO: We should probably check timingArray to make sure it is formed right
    TODO: And check that HTMLMediaElement is actually an HTMLMediaElement
  */
  timingArray.forEach(function(timingObj){
    this.addTimingObj(timingObj);
  });

  // quick sanity check
  this.checkTimingObj = function(timingObj){
    try {
     return timingObj.url && timingObj.length_seconds && timingObj.times.length;
    }
  };

  // add timing object converting relative time to absolute time
  this.addTimingObj = function(timingObj) {
    if (!this.checkTimingObj(timingObj)) {
      console.log("Error, malformed timing object: ", timingObj); return;
    }

    // build and store fileToken
    var time_increment = 0;
    if (this.fileList.length) time_increment = this.fileList.last().start + this.fileList.last().len;
    var fileref = this.fileList.length;
    var fileToken = {
      url: timingObj.url, fileref: fileref,
      start: time_increment, len: timingObj.length_seconds, end: time_increment+timingObj.length_seconds };
    this.fileList.push(fileToken);

    // add times to events list and time queue
    Object.keys(timingObj).forEach(function(token, id) {
      // token object looks like: _ub7: {start: 1.000, end: 1.280, fileref: 0 }
      token.start += time_increment;
      token.len =  (token.end + time_increment) - token.start;
      // eventQue is a sequential array of event tokens
      this.eventQue.push(token);
      this.eventRef[id] = {eventQueRef: this.eventQue.length-1, fileref: fileref}; // in case we need to reposition playhead
    });
  };

  // using a eventQue, try to jump to next event time
  // calculate time remaining until next event, check again.
  // TODO: resume when player starts
  this.eventCheck = function() {
    // exit if player is paused or if no events in queue
    if (this.player.paused || this.player.ended || !this.currentID) return;
    // check to see if current event & current id match playhead
    var currEvent = this.eventTokenFromID(this.currentID);
    var playhead = this.getCurrentTime(); // gets the absolute currentTime
    if (!currEvent || playhead<currEvent.start || playhead>currEvent.end) {
      // we're outside the bounds of the current id so call end event and set up new event
      this.onEndEvent(this.currentID);
      // get id from current playhead
      var currentID = this.getTimeID(playhead);
      this.onStartEvent(currentID);
      currEvent = this.eventRef[currentID];
    }
    // for whatever reason, we are still inside the same id, check back in remaining expected time plus 5ms
    setTimeout(this.eventCheck, ((currEvent.end - playhead)*1000)+5);
  };

  this.eventCheckCancel = function() {
    this.onEndEvent(this.currentID);
    this.currentID = -1;
  };




}





​// *********************
// Exposed functionality
// *********************
Jiffy.prototype = {
    constructor: Jiffy,

    eventTokenFromID: function(id) {
     var eventQueRef = this.eventRef[id].eventQueRef;
     return this.eventQue[eventQueRef];
    },

    fileTokenFromID: function(id) {
     var eventQueRef = this.eventRef[id].eventQueRef;
     return this.fileQue[fileQueRef];
    },

    // get playhead time in absolute terms
    getCurrentTime: function ()  {
      // get relative time
      var relTime = this.player.currentTime;
      var currentFile = this.fileList[this.currentFileRef];
      return currentFile.start + relTime;
    },

    // returns id for event token matching this time
    getTimeID: function (time)  {
      // TODO: replace this with binary search
      var newEvent;
      for (var i = 0; i < this.eventQue.length; i++) {
        newEvent = this.eventQue[i];
        if (time>newEvent.start && time<newEvent.end) return newEvent.id;
      }
    },

    // returns start time of event token matching this id
    getIDTime: function(id) {
      var eventToken = this.eventTokenFromID(id);
      return eventToken.start;
    },

    // returns hh:mm:ss.ss format
    formatTime: function(seconds) {
      // multiply by 1000 because Date() requires miliseconds
      var date = new Date(seconds * 1000);
      var hh = date.getUTCHours();
      var mm = date.getUTCMinutes();
      var ss = date.getSeconds();
      // If you were building a timestamp instead of a duration,
      //  you would uncomment the following line to get 12-hour (not 24) time
      // if (hh > 12) {hh = hh % 12;}
      // These lines ensure you have two-digits
      if (hh < 10) {hh = "0"+hh;}
      if (mm < 10) {mm = "0"+mm;}
      if (ss < 10) {ss = "0"+ss;}
      // This formats your string to HH:MM:SS
      var t = hh+":"+mm+":"+ss;
      return t;
    },

    // returns seconds
    toSeconds: function(formatted_time) {
      var parts = formatted_time.trim().split(':');
      return parts.pop() + (parts.pop() * 60) + (parts.pop * 3600);
    },

    // given arbitrary absolute time, return file token
    fileFromTime: function(time){
      this.fileList.forEach(function(fileToken){
        if ((time>=fileToken.start) && (time<=fileToken.start+fileToken.len)) return fileToken
      });
    }

    // returns time relative to the audio file it matches
    toRelativeTime: function(time) {
      // get file reference
      // subtract file start time
      var fileToken = fileFromTime(time);
      return time - fileToken.start;
    },

    // returns total length of all files
    totalPlayTime: function() {
      // get the last file object
      // return start time plus length
      var fileToken = this.fileList.last();
      return fileToken.start + fileToken.len;
    },

    // returns array of audio file names
    getFileList: function() {
      // get file ref list
      // strip off each file name
      var result = [];
      this.fileList.forEach(function(token){
        result.push(token.url);
      });
      return result;
    },

    // returns file token given URL
    getFileToken: function(url) {
      this.fileList.forEach(function(token){
        if (token.url == url) return token;
      });
    },

    // returns total length of file
    getFileLength: function(url) {
      // get file reference
      // return length
      var fileToken = this.getFileToken(url);
      return fileToken.start + fileToken.len;
    },

    // returns start time of given file
    getFileStartTime: function(url) {
      var fileToken = this.getFileToken(url);
      return fileToken.start;
    },

    // returns a timing object just like we fed in
    getTimingArray: function(url) {
      // get file reference id
      // gather up all the tokens matching this id
      var fileToken = this.getFileToken(url);
      var times = {};
      Object.keys(timingObj).forEach(function(token, id) {
        if (token.fileref === fileToken.fileref) {
          times[id] = {
            start: this.eventQue[id].start - fileToken.start,
            end: this.eventQue[id].end - fileToken.start
          }
        }
      }
      // reformat into array of relative timing array
      // timingArray should be an array of objects like:
      /* {
          "url": "http://media_file_url.mp4",
          "length_seconds": 4542.51,
          "times": {
            "_ub6": {"start": 0.000, "end": 1.000 },
            "_ub9": {"start": 2.040, "end": 2.160 }
        } } */
      return { url: url,
               length_seconds: fileToken.len,
               times: times };
    },


    //
    playFromID: function(id){
      // stop the current player if playing
      this.player.pause;
      // lookup file
      var eventToken = this.eventTokenFromID(id);
      var fileToken = this.fileTokenFromID(id);
      this.currentID = id;
      this.currentFile = eventToken.fileref; // this is the fileQue index
      // change out audio file if necessary
      if (this.player.src != fileToken.url) {
        this.player.src = fileToken.url;
      }
      // adjust player play position (which is relative to file)
      var relativeTime = eventToken.start - fileToken.start;
      this.player.currentTime = relativeTime;
      this.player.play();
    },

    // starts playing from the beginning of the event token in which this timestamp falls
    playFromTime: function(time) {
      var id = this.getTimeID(time);
      this.playFromID(id);
    },


}