// These are default values, which get overriden by env variables
// JWT_SECRET
// MONGO_DATABASE
// API_URL
module.exports = {
    'secret': 'this has to be changed',
    'mqttDb': 'mongodb://localhost:27017/mqtt',
    'apiUrl' : 'http://localhost:8080/api/'
};