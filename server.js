var express = require('express');
var http = require('http');
var orm = require("orm");
var util = require('util');
var bodyParser = require('body-parser');
var _io = require('socket.io');
var nconf = require('nconf');
var kue = require('kue'),
  queue = kue.createQueue();
global.domain  = require('domain');

nconf.argv().env().file({ file: './conf.json' });

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
      updated_at: { type: 'date', time: true }
    });
    next();
  }
}));

app.use(bodyParser.json());

// io.listen(3000, function () {
//   console.log('Example app listening on port 3000!');

// });

app.get('/', function (req, res) {
  res.send('Hello World!');
});

// var socket = io.listen(app);

socket.on('connection', function(client){ 
    console.log('Connection to client established');

    // Success!  Now listen to messages to be received
    client.on('message',function(event){ 
        console.log('Received message from client!',event);
    });

    client.on('disconnect',function(){
        clearInterval(interval);
        console.log('Server has disconnected');
    });
});


function scheduleJob(todo){
  var milliseconds = todo.due_date - (new Date()).getTime();
  var job = queue.create('notify'+todo.id, 
                  { todo_id: todo.id })
                  .delay(milliseconds)
                  .save(function(err){
                      todo.job_id = job.id;
                      todo.save();
                  });
  console.log("Job created");

  //Timer expires and we need to send notification from here
  //Hook to send notification
  queue.process('notify'+todo.id, function(job, done) {
    console.log("***Notify the user on due date***");
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
  var due_date = new Date(req.body.due_date)- (330*60*1000);
  req.models.todo.create({
      ticket_id: req.body.ticket_id,
      account_id: req.body.account_id,
      content: req.body.content,
      user_id: req.body.user_id,
      due_date: new Date(due_date),
      created_at: new Date(),
      updated_at: new Date()
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

app.get('/todos/:account_id/:ticket_id', function(req, res){
  req.models.todo.find({
    account_id: req.params.account_id, ticket_id: req.params.ticket_id
  }, function(err, todos){
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
