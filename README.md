# Any-Db-Client

Lets you subscribe to custom Meteor publications of any **database** or **data source** via [ccorcos:any-db](https://github.com/ccorcos/meteor-any-db) *outside* of the Meteor client environment. Written in ES6, compatible with React Native.

[Check out this article](https://medium.com/p/feb09105c343/).

# Getting Started

Simply add the two packages to your project:

```
meteor add ccorcos:any-db   // on your Meteor server
npm install any-db-client   // in your client folder
````

# API

On the client, create a new DDP connection using [node-ddp-client](https://github.com/hharnisc/node-ddp-client/) and initalize `AnyDb`:

```js
var DDPClient = require('ddp-client');
var AnyDb = require('any-db-client');

var ddpClient = new DDPClient({
  url: 'ws://localhost:3000/websocket',
  maintainCollections: false    // so that only AnyDb manages our data
});

AnyDb.initialize({
  ddpClient: ddpClient,
  debug: true   // optional, for extra logging
});

```

To subscribe to an [ccorcos:any-db](https://github.com/ccorcos/meteor-any-db) publication:
```js
// using a subset of ES7...
(async function() {
  try {
    await ddpClient.connect();
    var UsersSub = await AnyDb.subscribe('allUsers', []);
    console.log('UsersSub ready', UsersSub);
  
    UsersSub.onChange((data) => {
      // data is the entire subscription's dataset
      console.log("new UsersSub data:", data);
    });

    UsersSub.stop();
  } catch (err) {
    // handle errors
  }
})();
```

You can also create ``Stores``, which you can use to combine multiple collections, creating 'actions' and turn them into observables:

```js
var Users = AnyDb.createStore({
  observe: () => {
    return this.getMergedUsers();
  }

  subscribe: (newDocs, oldDocs) => {
    this.setState({
      users: newDocs.map((user) => {
          return user.likes.
        })
      });
    });
  }

  getMergedUsers: () => { return this.merge(getMongoUsers({}), getNeo4jUsers({})); }
  getMongoUsers: (query) => { return AnyDb.cache.allMongoUsers.find(query); }
  getNeo4jUsers: (query) => { return AnyDb.cache.allNeo4jUsers.find(query); }
})

// OR: just
/* 
Users.observe(() => {
  return Users.getMergedUsers();
});
Users.subscribe(onChange, context)
 */

var Todos = AnyDb.createStore({
  getTodos: function(authorId) {
    return cache.todos.find({authorId: authorId}, {sort: {completed: 1, timestamp: -1}});
  },

  // Mutation is straightforward.
  markComplete: function(todoId) {
    cache.todos.upsert({
      _id: todoId,
      completed: true,
    });
  },
})
```

On the server, set up your publications as you would with [ccorcos:any-db](https://github.com/ccorcos/meteor-any-db) (this example uses [ostrio:neo4jdriver](https://github.com/VeliovGroup/ostrio-neo4jdriver), but you can use any Fiber-wrapped database library):

```js
var db = new Neo4jDB('http://localhost:7474');

AnyDb.publish('allUsers', function() {
  var allUsersQuery = db.query('MATCH (users:User) RETURN users;').fetch();
  return Array.prototype.slice.call(allUsersQuery).map(function(node) {
    return node.users;
  });
});

var userCounter = 0;
Meteor.methods('addUser', function() {
  var _id = Random.id();
  var user = db.query('CREATE (user:User {props}) RETURN user;', {
    props: {
      _id: _id,
      username: 'testUser-' + _id
    }
  }).fetch();
  AnyDb.refresh('allUsers', function() { return true; });
  return user;
});

Meteor.methods('removeAllUsers', function() {
  var users = db.query('MATCH nodes DELETE nodes;').fetch();
  AnyDb.refresh('allUsers', function() { return true; });
  return users;
});
```
