const { U, R } = require('./utils.js');
const {
  changeDoc,
  findIndexById,
  newSortIndex
} = require('./helpers.js');

const random = new require('random-js')();

/**
 * Creates a subscription and Minimongo collection to an AnyDb publication
 */
class Subscription {
  constructor(name, query, anyDb, callback) {
    this.name = name;
    this.query = query;
    this.anyDb = anyDb;
    this.ddp = anyDb.ddp;

    // keep track of stored docs and sort order
    this.dataIds = {};
    this.sortIndices = [];
    this.ready = false;
    // create a minimongo collection for this subscription
    anyDb.cache.addCollection(name);
    this.collection = anyDb.cache[name];

    // onChange listeners, invoked when anything is added, removed or changed in associated collections
    this.listeners = {};

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
        this.ready = true;
        this._dispatchChange();
        callback(null, this);
      }
    });
  }

  stop() {
    this.ddp.unsubscribe(this.subId);
    for (let id in this.dataIds) {
      this.collection.remove(id);
    }
    // TODO: deleting collection
    // delete this.collection
    // delete this.anyDb.cache[this.name]
    this.dataIds = {};
    this.sortIndices = [];
    this.listeners = {};
  }

  reset() {
    this.dataIds = {};
    // this._dispatchChange();
  }

  /**
   * Sets a listener to be run the entire subscription's dataset when the subscription data changes
   * returns an object
  */
  onChange(listener) {
    let self = this;
    let id = random.hex(10);
    self.listeners[id] = listener;
    return {
      stop: () => {
        return delete self.listeners[id];
      }
    };
  }

  /**********************************************/
  /*                  helpers                   */
  /**********************************************/

  addedBefore(id, fields, before) {
    let doc = fields;
    doc._id = id;
    let sortIndex;
    this.dataIds[id] = true;

    if (before === null) {
      // if adding the new doc to the end
      sortIndex = newSortIndex(null, this.sortIndices);
      this.sortIndices.push({
        _id: id,
        sortIndex: sortIndex
      });
    } else {
      // get index of the following doc by its id
      let index = findIndexById(before, this.sortIndices);
      // TODO: why do we need to throw these errors?
      if (index < 0) { throw new Error('Expected to find before id', before); }

      sortIndex = newSortIndex(index, this.sortIndices);
      this.sortIndices.splice(index, 0, {
        _id: id,
        sortIndex: sortIndex
      });
    }

    doc._sortIndices = doc._sortIndices || {};
    doc._sortIndices[this.name] = sortIndex;
    this.collection.upsert(doc);
    this._dispatchChange();
  }

  movedBefore(id, before) {
    let fromIndex = findIndexById(id, this.sortIndices);
    if (fromIndex < 0) { throw new Error('Expected to find id', id); }
    this.sortIndices.splice(fromIndex, 1);
    let sortIndex;

    if (before === null) {
      // if moving doc to the end
      sortIndex = newSortIndex(null, this.sortIndices);
      this.sortIndices.push({
        _id: id,
        sortIndex: sortIndex
      });
    } else {
      // if moving doc within the collection
      let toIndex = findIndexById(before, this.sortIndices);
      if (toIndex < 0) { throw new Error('Expected to find before id', before); }

      sortIndex = newSortIndex(toIndex, this.sortIndices);
      this.sortIndices.splice(toIndex, 0, {
        _id: id,
        sortIndex: sortIndex
      });
    }

    let doc = this.collection.get(id);
    doc._sortIndices[this.name] = sortIndex;
    this.collection.upsert(doc);
    this._dispatchChange();
  }

  changed(id, fields) {
    let index = findIndexById(id, this.sortIndices);
    if (index < 0) { throw new Error('Expected to find id', id); }

    let doc = this.collection.get(id);
    changeDoc(doc, fields);
    this.collection.upsert(doc)
    this._dispatchChange();
  }

  removed(id) {
    let index = findIndexById(id, this.sortIndices);
    if (index < 0) { throw new Error('Expected to find id', id); }

    this.sortIndices.splice(index, 1);
    delete this.dataIds[id];
    this.collection.remove({_id: id});
    this._dispatchChange();
  }

  // calls a listener with the entire subscription's data
  // TODO: may not be necessary as we can subscribe to changes on the collection, not only the subscription
  _dispatchChange() {
    if (!this.ready) { return; }
    for (let id in this.listeners) {
      let sortOptions = { sort: {} };
      sortOptions['_sortIndices.' + this.name] = 1;
      this.listeners[id](R.clone(this.collection.find({}, sortOptions)));
    }
  }
}

module.exports = Subscription;
