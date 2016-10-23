var express = require('express');
var http = require('http');
var request = require('request');
var orm = require("orm");
var util = require('util');
var bodyParser = require('body-parser');
var _io = require('socket.io');
var nconf = require('nconf');
var cors = require('cors');
var kue = require('kue'),
  queue = kue.createQueue();
global.domain  = require('domain');
var pluralize = require('pluralize');
var request = require('request');
var btoa = require('btoa');

nconf.argv().env().file({ file: './conf.json' });
// PUSH MESSAGE
var GCMAPIKEY = "AIzaSyBILCc0_Kt0tbpyUQzfhMcFHBT4HZJMBhQ";
const webpush = require('web-push');
// VAPID keys should only be generated only once.
const vapidKeys = webpush.generateVAPIDKeys();

webpush.setGCMAPIKey(GCMAPIKEY);

webpush.setVapidDetails(
  'mailto:antoarundominic@gmail.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

////
var app = exports.app = express();
app.set('redisHost', nconf.get('redis').host);
app.set('redisPort', nconf.get('redis').port);
console.log('redisHost', util.inspect(app.get('redisHost')));
console.log('redisPort', util.inspect(app.get('redisPort')));
app.set('port', 3000);


var server, io;
var socket=_io(server);

function startServer (callback, callbackArg) {
  server = http.createServer(app).listen(app.get('port'), function(){
    util.log('Express server listening on port ' + app.get('port'));
  });
  exports.server = server;
  io = exports.io = _io(server);

  exports.ioDomain = ioDomain = domain.create();
  ioDomain.add(io.sockets);
  ioDomain.exit();

  exports.serverDomain = serverDomain = domain.create();
  serverDomain.add(server);
  serverDomain.exit();

  callback(callbackArg);
}

if (require.main === module) {
  console.log("Starting IO server");
  startServer(afterInit);
} else {
  exports.startServer = function(callback) { startServer(afterInit, callback); };
  exports.stopServer = function(callback) { server.close(callback); };
  exports.require = module.require;
}

function afterInit (callback) {
  require('./socketio/init.js');
  if (callback) { callback(); };
}


app.use(orm.express("mysql://root:@localhost/minions", {
  define: function (db, models, next) {
    models.todo = db.define("todo", {
      id: { type: 'number', key: true },
      account_id: {type: 'number'},
      ticket_id: {type: 'number' },
      user_id: { type: 'number'},
      content: { type: 'text', size: 255 },
      completed: {type: 'boolean', defaultValue: false },
      due_date: { type: 'date', time: true },
      job_id: { type: 'number' },
      created_at: { type: 'date', time: true },
      updated_at: { type: 'date', time: true },
      full_domain: {type: 'text'}
    });
    models.device = db.define("device", {
      id: { type: 'number', key: true },
      account_id: {type: 'number'},
      user_id: { type: 'number'},
      email: { type: 'text', size: 255 },
      device_id: { type: 'text' },
      p256dh: { type: 'text' },
      auth: { type: 'text' }
    });
    next();
  }
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(cors());

app.get('/', function (req, res) {
  res.send('Hello World!');
});

io.sockets.on('connection', function(socket){
  try{
    util.log("Websocket connection established with Client");
    console.log('SOcket Account', socket.account);
    socket.room = "Room_For_" + socket.account;
    console.log('Socket Account', socket.account);
    socket.join(socket.room);
    socket.on('init_socket', function(params){
      try{
        if(typeof params == 'string')
          params = JSON.parse(params);
        socket.user = params.user_id;
        socket.account = params.account_id;
        socket.account_url = params.account_url;
        socket.user_room = "Room_For_" + params.user_id + "_" + params.account_url;

        console.log('SOcket USER ROOM', socket.user_room);
        console.log('Account URL', params.account_url);
        socket.join('Room_For_'+params.account_url);
        socket.join(socket.user_room);
      } catch(error){
        console.log('error', 'Error in Init socket : ' + error.message);
      }
    });
    }catch(e)
    {
      console.log('error','Error in connection function : ' + e.message);
  }
});


function scheduleJob(todo){
  var milliseconds = todo.due_date - (new Date()).getTime();
  var job = queue.create('notify'+todo.id, todo)
                 .delay(milliseconds)
                 .save(function(err){
                      todo.job_id = job.id;
                      todo.save();
                  });

  //Timer expires and we need to send notification from here
  //Hook to send notification
  queue.process('notify'+todo.id, function(job, done) {
    // notifyUser(job.data.req, job.data.user_id, job.data.ticket_id, job.data.full_domain, 'Todo for ticket', 'Due');
    // done();
    // notifyTicket(req.body.iParams.full_domain, req.body.iParams.api_key,req);
    io.in("Room_For_" + job.data.user_id + "_" + job.data.full_domain).emit('todo_reminder', job.data);
  });
}

function removeJob(todo){
  //Deletion logic
  kue.Job.get( todo.job_id, function( err, job ) {
  // change job properties
    if (err) return;
    if(job!=undefined){
      console.log("Job Id : "+ job.id);
      job.remove(function(err,job){
        console.log('Job removed');
      }); 
    }
  });
}

app.post('/todos/', function (req, res) {
  var due_date=null;
  if(req.body.due_date)
  {
    due_date=new Date(req.body.due_date);
  }
  req.models.todo.create({
      ticket_id: req.body.ticket_id,
      account_id: req.body.account_id,
      content: req.body.content,
      user_id: req.body.user_id,
      due_date: due_date,
      created_at: new Date(),
      updated_at: new Date(),
      full_domain: req.body.full_domain 
    },function(err, todo){
      if(err) { console.log('Error Creating todo', err); }
      scheduleJob(todo);
      res.json(todo);
  });
});

app.get('/todos/:id', function(req, res){
  req.models.todo.get(req.params.id, function(err, todo){
    if(err) {
      console.log('Error Fetching Todo', err);
    }
    res.json(todo);
  });
});

app.get('/todos/:account_id/:ticket_id/:user_id', function(req, res){
  req.models.todo.find({
    account_id: req.params.account_id, ticket_id: req.params.ticket_id, user_id: req.params.user_id
  }, ['id', 'Z'], function(err, todos){
    if(err) {
      console.log('Error Fetching Todo', err);
    }
    res.json(todos);
  });
});

app.patch('/todos/:id', function(req,res){
  req.models.todo.get(req.params.id, function(err, todo) {
    var due_date=0,milliseconds=0;
    var dueDateChanged =false, statusChanged=false;
    if(err){
      console.log('Error Fetching Todo', err);
    }
    if(req.body.content){
      todo.content = req.body.content;
    }
    if(req.body.due_date){
      due_date = new Date(req.body.due_date)-(330*60*1000);
      if(todo.due_date != new Date(due_date)){
        dueDateChanged=true;
        console.log("Due Date Changed");
      }
      todo.due_date = new Date(due_date);
      milliseconds = due_date - (new Date()).getTime();
    }
    if(req.body.completed){
      if(todo.completed != req.body.completed){
        statusChanged=true;
        console.log("Completion Changed");
      }
      todo.completed =req.body.completed;
    }
    todo.save();
    if(dueDateChanged || statusChanged){
      removeJob(todo);
      if(milliseconds > 0){
        scheduleJob(todo);
      }
    }
    res.json(todo);
  });
});

app.delete('/todos/:id',function(req, res){
  req.models.todo.get(req.params.id, function(err, todo){
    if(err){
      console.log('error while deleting todo');
    }
    todo.remove();
    res.json(todo);
  });
});


app.post('/ticket_updated',function(req, res){
  console.log('Body of Request inside Ticket Updated',req.body);
  io.in('Room_For_'+req.body.iParams.full_domain).emit('ticket_updated', req.body);
  // var user_id= req.body.iParams.user_id;
  notifyTicket(req.body.iParams.full_domain, req.body.iParams.api_key,req,'Updated');
  res.json(true);
});


app.get('/device/', function(req, res) {
  req.models.device.find({
    user_id: req.query.userId
  }, ['id', 'Z'], function(err, devices){
      if(devices[0]){
        var device=devices[0];
        device.auth=req.query.auth;
        device.p256dh=req.query.p256dh;
        device.save();
        initialNotification(device);
        console.log('Device Id : ', device.id);
        if(err) { console.log('Error updating device', err); }
        res.json(true);
      }
      else{
        console.log("Create");
        req.models.device.create({
            account_id: req.query.accountId,
            device_id: req.query.deviceId,
            p256dh: req.query.p256dh,
            auth: req.query.auth,
            email: req.query.email,
            user_id: req.query.userId,
            created_at: new Date()
          },function(err, device){
            console.log('Device Created : ', device.id);
            initialNotification(device);
            if(err) { console.log('Error Creating device', err); }
            res.json(true);
        });
      }
  });
});


app.post('/note_added',function(req, res){
  console.log('Body of Request inside note added',req.body);
  io.in('Room_For_'+req.body.iParams.full_domain).emit('note_added', req.body);
  res.json(true);
});

app.post('/ticket_created', function(req, res){
  // console.log('Body of Request inside Ticket Created',req.body);
  console.log('Body of Request inside Ticket Created');
  // ticket = fetchResource(req.body.iParams.full_domain, 'ticket', req.body.context.data.id, req.body.iParams.api_key);
  notifyTicket(req.body.iParams.full_domain, req.body.iParams.api_key,req,'Created');
  res.json(true);
});

function initialNotification(device ,msg) {
  // var msg = {
  //   registration_ids: [device_id],
  //   data: {
  //     message: "Hello mundo cruel :P" // your payload data
  //   }

  // }","auth":"Gp0NKhA4HC7E-hIW-iYCVg=="}}"

  const pushSubscription = {
    endpoint: 'https://android.googleapis.com/gcm/send/'+device.device_id,
    keys: {
      auth: device.auth,
      p256dh: device.p256dh
    }
  };
  sendGCM(pushSubscription, msg);
}

function sendGCM(subscription, msg) {
  // msg  = msg || { title: 'Hello', body: 'Welcome' };
  var payload = JSON.stringify(msg);
  var resp = webpush.sendNotification(subscription, payload).then(function(data) {
    console.log("sendGCM res", data);  
  });
  
  // request.post({
  //   uri: 'https://android.googleapis.com/gcm/send',
  //   json: msg,
  //   headers: {
  //     Authorization: 'key=' + GCMAPIKEY
  //   }
  // }, function(err, response, body) {
  //   // callback(err, body);
  //   console.log("err", err);
  //   console.log("response", response);
  //   console.log("body", body);
  // })
}

function notifyTicket(domain, key,req,action) {
  var ticketId;
  try{
    ticketId = req.body.context.data.id;
  }
  catch(e){
    ticketId = 1;
  }
  request({
      url: 'https://'+ domain + '/helpdesk/tickets/'+ticketId+'.json',
      headers: { Authorization: "Basic " + btoa(key + ':X') },
      json: true,
      method: 'GET'
    },function(st, res, body){
      console.log('St', st);
      console.log('Res', res);
      console.log('Body', body);
      console.log('DOmain', domain);
      console.log('body.helpdesk_ticket', body.helpdesk_ticket);
      // io.in('Room_For_'+domain).emit('ticket_created', body.helpdesk_ticket);
      notifyUser(req,req.body.context.data.responder_id,body.helpdesk_ticket.display_id, domain,'Ticket',action );
  });
}

function notifyUser(req, user_id, ticket_id, domain, model, action){
  // user_id=56;
  if(user_id==null) { 
    console.log("USER ID NOT FOUND");
    return;
  };
  req.models.device.find({
        user_id: user_id
      }, ['id', 'Z'], function(err, devices){
          if(devices[0]){
            var device=devices[0];
            console.log("Notified User");
            initialNotification(device, {title: 'Ticket [#'+  ticket_id + ']'+action, body:'https://'+domain+'/helpdesk/tickets/' + ticket_id });
            if(err) { console.log('Error Creating notification', err); }
            // res.json(true);
    }
  });
}