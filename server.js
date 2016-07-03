 
var mosca = require('mosca');
var jwt    = require('jsonwebtoken'); // used to create, sign, and verify tokens
var request = require('request-json');
var Q = require('q');
var config = require('./config'); // get our config file

// Get config variables from ENVIRONMENT or from defaut config file
var jwtSecret = process.env.JWT_SECRET || config.secret;
var apiUrl = process.env.API_URL || config.apiUrl;
var mqttDb = process.env.MQTT_DB || config.mqttDb;

var apiClient = request.createClient(apiUrl);

//Mosca mqtt broker configuration
var ascoltatore = {
  //using ascoltatore
  type: 'mongo',
  url: mqttDb,
  pubsubCollection: 'ascoltatori',
  mongo: {}
};

// MQTT Settings (including web sockets http config)
var settings = {
  port: 1883,
  backend: ascoltatore,
  http: {
      port: 3000,
      bundle: true,
      static: './'
  }
};

// Accepts the connection if the username is jwt and the password is a valid token
var authenticate = function(client, username, password, callback) {

  if (username === 'jwt') {
    var token = password.toString();
    // verifies secret and checks exp
    jwt.verify(token, jwtSecret, function(err, decoded) {      
      if (err) {
        var authorized = false;

      } else {
        var authorized = true;

        // The token payload (with user email & username) will be persisted in client.user
        // The token itself will be persisted in client.token
        client.user = decoded;
        client.token = token;
      }
      callback(null, authorized); 
    });
  } else {
    callback(null, false);    
  }

}

// In this case the client authorized as alice can publish to /users/alice taking
// the username from the topic and verifing it is the same of the authorized user
var authorizePublish = function(client, topic, payload, callback) {

  var topicList = topic.split('/');

  var topic_1 = topicList.length >=1 ? topicList[0] : null;
  var topic_2 = topicList.length >=2 ? topicList[1] : null;
  var name = client.user.username;

  // Check if the first topic is the username
  if (topic_1 !== name) {
    callback(null,false);
  } else {
    callback(null, true);
  }

}

/**
 * Sends the published date to our backendAPI
 */
function sendData(packet, client) {
  var deferred = Q.defer();

  // Topic is expecetd in the form /username/device/pin (E.g. /jsmith/my-arduino/1)
  var topic = packet.topic;

  var topicList = topic.split('/');

  var username = topicList.length >=1 ? topicList[0] : null;  // Currently not used
  var deviceName = topicList.length >=2 ? topicList[1] : null;
  var pin = topicList.length >=3 ? topicList[2] : null;

  // Authorization token is needed to communicate to the API 
  var token = client.token;

  // Auxiliary function that converts a uint8array (aray of bytes) to a text represnetation
  var ua2text = function(ua) {
    var s = '';
    for (var i = 0; i < ua.length; i++) {
        s += String.fromCharCode(ua[i]);
    }
    return s;
  }

  var value = ua2text(packet.payload);

  //The endpoint will expect an object with a value attribute
  var data = {
    "value": value,
  };

  // We will send the token as an Authorization header
  apiClient.headers['Authorization'] = 'Bearer '+token;

  // update the pins value through endpoint /api/devices/:deviceName/pins/:pin
  apiClient.put('devices/'+deviceName+'/pins/'+pin, data, function(err, res, body) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve();
    }
  });

  return deferred.promise;
}




// In this case the client authorized as alice can subscribe to /users/alice taking
// the username from the topic and verifing it is the same of the authorized user
var authorizeSubscribe = function(client, topic, callback) {

  //callback(null, client.user == topic.split('/')[1]);
  callback(null, true);
}

var server = new mosca.Server(settings);

server.on('clientConnected', function(client) {
    console.log('client connected', client.id);
});

// fired when a message is received
server.on('published', function(packet, client) {
  // If data received from a client, send it to the API
  if (client) sendData(packet, client);

  console.log('Published', packet.payload);
});

server.on('ready', setup);

function setup() {
  server.authenticate = authenticate;
  server.authorizePublish = authorizePublish;
  server.authorizeSubscribe = authorizeSubscribe;
  console.log('Mosca server is up and running');
}


