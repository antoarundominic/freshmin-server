var parent     = module.parent.exports;
var io         = parent.io;
var app        = parent.app;
var _redis     = require('socket.io-redis');
var crypto     = require('crypto');
var base64     = require('../plugins/base64.js');

var REDIS_HOST = app.get('redisHost');
var REDIS_PORT = app.get('redisPort');

var debug = require('debug')('freshfone:init');

io.adapter(_redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  key : 'FRESHFONE:SOCKET.IO:ROOM',
  node: require('os').hostname() + ':' + app.get('port')
}));

// Monkey patch from FreshChat, to avoid FF and Safari's CORS errors
var handleReq = io.eio.handleRequest;
io.eio.handleRequest = function(){
  try{
    var args = Array.prototype.slice.call(arguments);
    req = args[0];
    res = args[1];
    if ('OPTIONS' == req.method) {
        io.eio.prepare(req);
        var headers = {};
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
         if (req.headers.origin) {
           headers['Access-Control-Allow-Credentials'] = 'true';
           headers['Access-Control-Allow-Origin'] = req.headers.origin;
        } else {
            headers['Access-Control-Allow-Origin'] = '*';
        }
        res.writeHead(200, headers);
        res.end();
    } else {
        handleReq.apply(io.eio, args);
    }
  }catch(err){
      console.log('Error in handleRequest monkey patch');
  }
};

io.use(function(socket, accept) {
  var data = socket.request;
  try{
    debug("Authorizing Socket.io connection..");
    if(socket.handshake.query){
      var query = base64.decode(decodeURIComponent(socket.handshake.query.s)),
          session = query.split("&|&"),
          user_id = session[0],
          account = session[1],
          node_session = session[2];
        console.log('client authorized to connect to the node.js server. Account id: ' + account + ' user_id: ' + user_id);
        socket.account = account;
        accept(null, true);  
    }else{
      util.log('client not authorized - could not find/validate helpdesk rails session');
      accept('Not authorized - could not find/validate helpdesk rails session', false);
    }
  }catch(err){
    console.log('error','Error while handshaking : ' + err.message);
  }
});
