 
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

// Accepts the connection if the username is jwt and teh password is a valid token
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

  // Check if the first topic is the udername
  if (topic_1 !== name) {

    callback(null,false);
  } else {
    validDevice(client.token,topic_2)
    .then(function() {
      callback(null, true);
    })
    .catch(function() {
      callback(null, false);
    })
  }

}

function validDevice(token, deviceName) {
  var deferred = Q.defer();

  // Check if the device name is valid for this user
  apiClient.get('devices/'+deviceName+'?token='+ token, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      // We found a device with this name for the user
      if (body.deviceName == deviceName) {
        deferred.resolve(true);
      } else {
        deferred.reject("Non existent device for this user");
      }

    } else {s
      console.log(error);
      console.log(response);
      console.log(body);
      deferred.reject(body.message || "Not Found");
    }
  })

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
  console.log('Published', packet.payload);
});

server.on('ready', setup);

function setup() {
  server.authenticate = authenticate;
  server.authorizePublish = authorizePublish;
  server.authorizeSubscribe = authorizeSubscribe;
  console.log('Mosca server is up and running');
}

