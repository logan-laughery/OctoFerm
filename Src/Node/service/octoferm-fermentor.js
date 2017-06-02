//http://stackoverflow.com/questions/18188083/javascript-oop-in-nodejs-how
//http://stackoverflow.com/questions/17580347/programmatically-removing-all-bluetooth-devices-on-the-linux-command-line
// Use bt-device -l to list all devices (from bluez-tools)
var BluetoothDevice = require('./bluetooth-device.js');
var models  = require('../data/models');
var method = Fermentor.prototype;

function Fermentor(address, id, verbose) {
  this.id = id;
  this.settings = {};
  this.desiredSettings = {};
  this.device = new BluetoothDevice(address);
  this.verbose = true;
  this.status = {};
  this.actual = {};

  this.lastExecution = null;
  this.lastSettingsPoll = null;
  this.lastTempPoll = null;
  this.lastPumpPoll = null;
  this.lastMemPoll = null;
}

method.close = function() {
  this.device.close();
}

method.executeTest = function() {
  var self = this;
  return this.getDevice().then(() => self.getTemp());
}

method.executeTest2 = function() {
  var self = this;
  return this.getDevice().then(() => self.getMem());
}

method.executeTest3 = function() {
  var self = this;
  return this.getDevice().then(() => self.getSettings());
}

method.log = function(message, type) {
  var self = this;
  if(self.verbose) {
    var d = new Date();
    console.log(d + " - " + type + " - " + message);
  }
}

method.sendOnInterval = function(lastPerformedKey, intervalSec) {
  var self = this;
  var current = new Date();
  var secsBetweenCommands = 1;
  // if(self.lastExecution && ((current - self.lastExecution) / 1000) < secsBetweenCommands)
  //   return false;

  if(!self[lastPerformedKey] ||
    ((current - self[lastPerformedKey]) / 1000) >= intervalSec) {
    self[lastPerformedKey] = current;
    return true;
  }
  return false;
}

method.loop = function() {
  var self = this;
  var promise = new Promise(resolve => resolve());

  if(self.sendOnInterval('lastTempPoll', 5)){
    promise = promise.then(() => self.getState()).then((result) => {
      self.log("Polled state: " + JSON.stringify(result), "INFO");
    });
  }

  if(self.sendOnInterval('lastSettingsPoll', 30)){
    promise = promise.then(() => self.getDevice())
      .then(() => self.updateSettings()).then((result) => {
        self.log("Polled settings: " + JSON.stringify(result), "INFO");
    });
  }

  if(self.sendOnInterval('lastMemPoll', 300)){
    promise = promise.then(() => self.getMem()).then((result) => {
      self.log("Polled memory: " + JSON.stringify(result), "INFO");
    });
  }

  promise = promise.catch((err, message) => {
    self.log(message + ':' + JSON.stringify(err), "ERROR")
    //console.log('Error:'+ message + ':' + JSON.stringify(err))
    return self.logMessage(true, JSON.stringify(err));
  });

  return promise;
}

method.execute = function() {
  // Update state
  //this.getDevice().then(() => getTemp())
    //.catch((err) => {console.log(err)});
    var self = this;
    return this.getDevice().then(() => self.getTemp())
      .then(() => {self.log('Completed command')})
      .catch(err => {self.log('Error occurred:' + err)});
  // Wait 1 second
  // Check for actions

  // Then wait 5 seconds

  // Get temp

  // Then wait call execute in 5 seconds

  // Catch exceptions and wait to execute accordingly
}

method.getDevice = function() {
  var self = this;
  return models.Device.findById(self.id, {
    include: [{ model: models.Settings }]
  })
  .then(function (device) {
    //self.log('Result retrieved from db');
    if(device.Setting)
      self.desiredSettings = device.Setting;
    else {
      self.desiredSettings = {
        "temperature": 70,
        "pumpState": "auto"
      }
    }
  });
}

method.logMessage = function(isError, message) {
  var self = this;
  return models.Log.create({
    DeviceId: self.id,
    error: isError,
    message: message
  });
}

method.saveStatus = function(temp, isPumpOn, isAuto) {
  var self = this;
  //console.log("saving status:" + temp + " " + isPumpOn + " " + isAuto);
  return models.Status.create({
    DeviceId: self.id,
    temperature: temp,
    pumpState: isPumpOn,
    automatic: isAuto,
  });
}

method.setTemp = function(temp) {
  var self = this;
  var command = 'temp:' + temp;
  return self.sendCommand(command, 'temp')
    .then((result) => {
      return self.logMessage(false, 'Set temp to: ' + temp);
    });
}

method.setPump = function(state) {
  var self = this;
  var command = 'state:' + state;
  return self.sendCommand(command, 'state')
    .then((result) => {
      return self.logMessage(false, 'Set pump state to: ' + state);
    });
}

method.getTemp = function() {
  var self = this;
  //self.log('Get temp');
  return self.sendCommand('tempstatus', 'tempstatus:')
    .then((result) => {
      var temp = result.substring(0, result.length - 1)
        .split(":")[1];
      return { temperature: Number(temp) };
    })
    .then((result) => {
      return self.saveStatus(result.temperature,
        self.actual.pumpRunning === true, self.actual.automaticControl === true);
    });
}

method.getMem = function() {
  var self = this;
  //self.log('Get mem');
  return self.sendCommand('memstatus', 'memstatus:')
    .then((result) => {
      var mem = result.substring(0, result.length - 1)
        .split(":")[1];
      return { memory: mem };
    })
    .then((result) => {
      var mem = result;
      return self.logMessage(false, 'Remaining memory: ' + result.memory)
        .then(() => {
          return mem;
        });
    });
}

method.updateSettings = function () {
  var self = this;
  return self.getSettings()
    .then((actual) => {
      var promise = new Promise(resolve => resolve());
      var desired = self.desiredSettings;
      self.status = actual;
      if(desired.temperature != actual.temperature) {
        self.log("Need to set temp - Actual: " + actual.temperature + " Desired: " + desired.temperature, "WARNING");
        promise = promise.then(() => self.setTemp(desired.temperature)); // Set temp
      }
      if(desired.pumpState === 'auto' && !actual.automaticControl) {
        self.log("Need to set pump - Auto: " + actual.automaticControl + " Desired: " + desired.pumpState, "WARNING");
        promise = promise.then(() => self.setPump(0));// Set pump to auto
      } else if(desired.pumpState === 'on' && (!actual.pumpRunning || actual.automaticControl)) {
        self.log("Need to set pump - Auto: " + actual.automaticControl + " Desired: " + desired.pumpState, "WARNING");
        promise = promise.then(() => self.setPump(1));// Set pump on
      } else if(desired.pumpState === 'off' && (actual.pumpRunning || actual.automaticControl)) {
        self.log("Need to set pump - Auto: " + actual.automaticControl + " Desired: " + desired.pumpState, "WARNING");
        promise = promise.then(() => self.setPump(2));// Set pump off
      }

      var response = {};
      response.actual = actual;
      response.desired = { "temperature" : desired.temperature, "pumpState" : desired.pumpState };
      promise = promise.then(() => { return response });

      return promise;
    });
}

method.getSettings = function() {
  var self = this;
  //self.log('Get settings');
  return self.sendCommand('getsettings', 'getsettings:')
    .then((result) => {
      var vals = result.substring(0, result.length - 1)
        .split(":")[1].split("|");
      return {
        temperature: vals[0],
        automaticControl: vals[1] === "1",
        pumpRunning: vals[2] === "1"
      };
    });
}

method.getState = function() {
  var self = this;
  //self.log('Get state');
  return self.sendCommand('gs', 'gs:')
    .then((result) => {
      var vals = result.substring(0, result.length - 1)
        .split(":")[1].split("|");
      return {
        temperature: vals[0],
        pumpRunning: vals[1] === "1"
      };
    })
    .then((result) => {
      var state = result;
      return self.saveStatus(result.temperature,
          result.pumpRunning === true, self.actual.automaticControl === true)
        .then((response) => {
          return state;
        });
    });
}

method.sendCommand = function(command, expected) {
  var self = this;
  return self.device.executeCommand(command, expected, 1000)
    .catch((err) => {
      //console.log('Err: ' + err)
      self.log("Attempting to send command '" + command + "' again due to error: " + err, "WARNING")
      return self.device.executeCommand(command, expected, 1000)}
    ).catch((err) => {
      //console.log('Err(x2): ' + err)
      self.log("Attempting to send command '" + command + "' one more time due to error: " + err, "WARNING")
      return self.device.executeCommand(command, expected, 1000)}
    );;
}

module.exports = Fermentor;
