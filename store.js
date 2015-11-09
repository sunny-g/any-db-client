const { U, R } = require('./utils.js');

class Store {
  constructor(anyDb, actions) {
    this.anyDb = anyDb;
    U.extend(this, R.omit(['observe', 'subscribe'], actions));
  }

  registerAction(name, action) {
    return this[name] = action;
  }

  observe(queryFn, context) {
    context = context || this;
    return this.observable = this.anyDb.cache.observe(queryFn, context);
  }

  subscribe(listener, context) {
    context = context || this;
    return this.observable.subscribe.call(context, listener);
  }

  dispose() {
    return this.observable.dispose();
  }
}

module.exports = Store;
/*
var Users = AnyDb.createStore({
  getMongoUsers: (query) => {
    return AnyDb.cache.allMongoUsers.find(query);
  }
  getNeo4jUsers: (query) => {
    return AnyDb.cache.allNeo4jUsers.find(query);
  }
})

Users.observe(() => {
  return Users.getMergedUsers();
});
Users.subscribe((newValues, oldValues) => {
  // do something with new store's values
}, context);

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
 */