var express = require('express');
var orm = require("orm");
var util = require('util');
var bodyParser = require('body-parser');
// var lt = require('long-timeout');
var kue = require('kue')
 , queue = kue.createQueue();
var app = express();

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

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});

app.get('/', function (req, res) {
  res.send('Hello World!');
});

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
        var milliseconds = todo.due_date - (new Date()).getTime();
        var job = queue.create('notify'+todo.id, 
                  { todo_id: todo.id })
                  .delay(milliseconds)
                  .save(function(err){
                      todo.job_id = job.id;
                      todo.save();
                  });

      //Timer expires and we need to send notification from here
      //Hook to send notification
      queue.process('notify'+todo.id, function(job, done) {
        console.log("Notify the user on due date");
      });

      if(err) { console.log('Error Creating todo', err); }
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
    if(err){
      console.log('Error Fetching Todo', err);
    }
    if(req.body.content){
      todo.content = req.body.content;
    }
    if(req.body.completed) {
      todo.completed = req.body.completed;
      console.log("inside completed");
      //Undo logic should be thought.
      //Deletion logic
      kue.Job.get( todo.job_id, function( err, job ) {
      // change job properties
        if (err) return;
        console.log("Job Id : "+ job.id);
        job.remove(function(err,job){
          console.log('removed completed job #%d', job.id);
        });
      });
    }
    todo.save();
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
