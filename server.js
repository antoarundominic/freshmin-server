var express = require('express');
var orm = require("orm");
var util = require('util');
var bodyParser = require('body-parser');
var app = express();

app.use(orm.express("mysql://root:@localhost/minions", {
  define: function (db, models, next) {
    console.log('Hello');
    models.todo = db.define("todo", {
      id: { type: 'number', key: true },
      ticket_id: {type: 'number' },
      content: { type: 'text', size: 255 },
      user_id: { type: 'number'},
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

app.post('/todo/', function (req, res) {
  req.models.todo.create({
      ticket_id: req.body.ticket_id,
      content: req.body.content, user_id: req.body.user_id,
      created_at: new Date(), updated_at: new Date()
    },function(err, todo){
      if(err) throw err;
      console.log('Successfully created a todo');
      res.send(todo);
  });
});
