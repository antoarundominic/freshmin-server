var express = require('express');
var orm = require("orm");
var util = require('util');
var bodyParser = require('body-parser');
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
  req.models.todo.create({
      ticket_id: req.body.ticket_id, account_id: req.body.account_id,
      content: req.body.content, user_id: req.body.user_id,
      created_at: new Date(), updated_at: new Date()
    },function(err, todo){
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
