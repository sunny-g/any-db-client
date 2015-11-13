const { U, R } = require('./utils.js');
const {
  changeDoc,
  findDocIndexById
} = require('./helpers.js');
const random = new require('random-js')();
// const { observable } = require('mobservable');

window.mobservable = require('mobservable');
const observable = mobservable.observable;

class Subscription {
  constructor(name, query, anyDb, callback) {
    this.name = name;
    this.query = query;
    this.anyDb = anyDb;
    this.ddp = anyDb.ddp;

    this.data = observable([]);
    this.dataIds = {};
    this.ready = observable(false);

    // disposers, returned from observe
    this.disposers = {};

    // TODO: what do we use this for?
    var lap = U.stopwatch();
    
    // TODO: sub.coffee line 97
    // do we need to wrap this in Tracker.nonreactive??
    // TODO: does the query need to be wrapped in an Array?
    this.subId = this.ddp.subscribe(name, [query], (err) => {
      if (err) {
        // TODO: better error handling, should retry after some time-limit
        console.log('error subscribing to:', name, err);
        callback(err, null);
      } else {
        this.ready(true);
        callback(null, this);
      }
    });
  }

  observe(listener, fireImmediately) {
    fireImmediately = fireImmediately || false;
    let id = random.hex(10);
    let disposer = mobservable.autorun(() => {
      listener(this.data);
    }, fireImmediately);
    this.disposers[id] = disposer;
    return this.dispose.bind(this, id);
  }

  dispose(id) {
    this.disposers[id]();
    delete this.disposers[id];
  }

  disposeAll() {
    for (let id in this.disposers) {
      this.dispose(id);
    }
    this.disposers = {};
  }

  stop() {
    this.disposeAll();
    this.ddp.unsubscribe(this.subId);
    this.data.clear();
    this.dataIds = {};
  }

  reset() {
    this.data.clear();
    this.dataIds = {};
  }

  _addedBefore(id, fields, before) {
    let doc = fields;
    doc._id = id;
    // let dataIds know there's a new doc
    this.dataIds[id] = true;
    if (before === null) {
      // when adding a new doc to the end
      this.data.push(doc);
    } else {
      // when adding a new doc in the middle of the sub
      let index = findDocIndexById(before, this.data);
      if (index < 0) { throw new Error('Expected to find before id', before); }
      this.data.splice(index, 0, doc);
    }
  }

  _movedBefore(id, before) {
    let fromIndex = findDocIndexById(id, this.data);
    if (fromIndex < 0) { throw new Error('Expected to find id', id); }
    let doc = this.data[fromIndex];

    mobservable.transaction(() => {
      this.data.splice(fromIndex, 1);
      if (before === null) {
        this.data.push(doc);
      } else {
        let toIndex = findDocIndexById(before, this.data);
        if (toIndex < 0) { throw new Error('Expected to find before id', before); }
        this.data.splice(toIndex, 0, doc);
      }
    })
  }

  _changed(id, fields) {
    let index = findDocIndexById(id, this.data);
    if (index < 0) { throw new Error('Expected to find id', id); }
    changeDoc(this.data[index], fields);
  }

  _removed(id) {
    let index = findDocIndexById(id, this.data);
    if (index < 0) { throw new Error('Expected to find id', id); }
    // oldDoc is currently unused
    let oldDoc = this.data.splice(index, 1)[0];
    delete this.dataIds[id];
  }
}

module.exports = Subscription;
