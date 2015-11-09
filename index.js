const { R } = require('./utils.js');
const { parseDDPMsg } = require('./helpers.js');
const Subscription = require('./subscription.js');
const Store = require('./store.js');
const minimongo = require('minimongo-cache');

class AnyDb {
  constructor(opts) {
    this.DB_KEY = opts.DB_KEY || 'any-db';
    this.ddp = opts.ddpClient;
    this.debug = opts.debug || false;
    this.subs = {};
    this.cache = new minimongo();

    // handle all DDP messages
    this.ddp.on('message', (data) => {
      let msg = JSON.parse(data);
      if (msg.collection !== this.DB_KEY) {
        // handle data the way it would be handled with node-ddp-client and minimongo-cache
        return;
      }
      if (msg.id === undefined) {
        return;
      }

      let {
        id,
        fields,
        positions,
        cleared
      } = parseDDPMsg.call(this, msg);

      if (this.debug) {
        console.groupCollapsed('ddp message:');
          console.log('id:', id)
          console.log('fields:', fields);
          console.log('positions:', positions);
          console.log('cleared:', cleared);
          console.log('original msg:', msg);
        console.groupEnd();
      }

      if (msg.msg === 'added') {
        return added.call(this, id, fields, positions);
      } else if (msg.msg === 'changed') {
        return changed.call(this, id, fields, positions, cleared);
      } else if (msg.msg === 'removed') {
        return removed.call(this, id);
      } else {
        console.error('unhandled DDP msg', msg);
      }
    });
  }

  /**
   * returns {Promise}
   */
  subscribe(name, query) {
    query = query || {};
    return new Promise((resolve, reject) => {
      let sub = new Subscription(name, query, this, (err, sub) => {
        if (err) {
          console.log('error in subscribing', err);
          reject(err);
        } else {
          sub.stop = () => {
            Subscription.prototype.stop.call(sub);
            delete this.subs[sub.subId];
          }
          resolve(sub);
        }
      });
      // add this subscription to our anyDb's subs
      this.subs[sub.subId] = sub;
    });
  }

  /**
   * Returns a Store with registered actions on some portion of the cache
   */
  createStore(actions) {
    return new Store(this, actions);
  }

  /**
   * Retrieves a document by id from anywhere in the cache
   */
  // TODO: ??? this could get a doc with less or irrelevant info
  findInCache(id) {
    for (let collection in this.cache.collections) {
      let doc = this.cache[collection].get(id);
      if (doc) {
        return doc;
      }
    }
    return undefined;
  }

  /**
   * Retrieves a document using Minimongo's find from within a given collection
   */
  find(collectionName, ...options) {
    return this.cache[collectionName].find(...options);
  }

  /**
   * Upsert this doc into some collection
   */
  upsert(collectionName, doc) {
    return this.cache[collectionName].upsert(doc);
  }

  /**
   * Remove the doc(s) that match the selector from some collection
   */
  remove(collectionName, selector) {
    return this.cache[collectionName].remove(selector);
  }
}

/***********************************************/
/*               message handlers              */
/***********************************************/
function added(id, fields, positions) {
  for (let subId in positions) {
    let before = positions[subId];
    let sub = this.subs[subId];
    sub.addedBefore(id, R.clone(fields), before);
  }
  return;
}

function changed(id, fields, positions, cleared) {
  // remove cleared subscriptions which come in as a subId
  // position set to undefined
  for (let subId in cleared) {
    let sub = this.subs[subId];
    // the subscription cleans itself up when it stops so it may not be found
    if (sub !== undefined) {
      sub.removed(id);
    }
  }

  // this handles position changes
  let memoizedFind = R.memoize(this.findInCache);
  for (let subId in positions) {
    let before = positions[subId];
    let sub = this.subs[subId];
    // TODO: does the following note still apply to us?
    // sub could be null if logout and in really quickly
    if (!sub) { return; }
    if (sub.dataIds[id]) {
      // if the doc exists in this sub, move it to a new location
      sub.movedBefore(id, before);
    } else {
      // if the doc doesnt exist in this sub, find it from another sub and add it to this sub
      let doc = memoizedFind(id);
      sub.addedBefore(id, doc, before);
    }
  }

  // basic field changes
  if (Object.keys(fields).length > 0) {
    for (let subId in this.subs) {
      let sub = this.subs[subId];
      if (sub.dataIds[id]) {
        sub.changed(id, R.clone(fields));
      }
    }
  }
  return;
}

function removed(id) {
  for (let subId in this.subs) {
    let sub = this.subs[subId];
    if (sub.dataIds[id]) {
      sub.removed(id);
    }
  }
  return;
}

function log() {
  if (AnyDb.debug) {
    console.log(...arguments);
  }
}

module.exports = AnyDb;
