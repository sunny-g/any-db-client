const Subscription = require('./subscription.js');
const { R } = require('./utils.js');
const { parseDDPMsg } = require('./helpers.js');
const minimongo = require('minimongo-cache');

let AnyDb = {};
AnyDb.initialize = function(opts) {
  // TODO: new minimongo() as the db's storage?
  this.DB_KEY = opts.DB_KEY || 'any-db';
  this.ddp = opts.ddpClient;
  this.debug = opts.debug || false;
  this.subs = {};
  this.cache = new minimongo();

  // handle all DDP messages
  this.ddp.on('message', (data) => {
    let msg = JSON.parse(data);
    if (msg.id === undefined) { return; }

    let {
      id,
      // TODO: better name for fields?
      fields,
      positions,
      // TODO: better name for cleared?
      cleared
    } = parseDDPMsg.call(this, msg);

    log('id:', id, 'fields:', fields, 'positions:', positions, 'cleared:', cleared, 'original msg:', msg);

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
};

/**
 * returns {Promise}
 */
AnyDb.subscribe = function(name, query) {
  return new Promise((resolve, reject) => {
    var sub = new Subscription(name, query, this, (err, sub) => {
      if (err) {
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
};

/**
 * Finds a document by id throughout all subscription's datasets
 */
AnyDb.find = function(id) {
  for (let subId in this.subs) {
    if (this.subs[subId][id]) {
      let index = findDocIdIndex(id, this.data);
      return R.clone(this.data[index]);
    }
  }
  return undefined;
};

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

  // TODO: annotate this
  // this handles position changes
  let memoizedFind = R.memoize(this.find);
  for (let subId in positions) {
    let before = positions[subId];
    let sub = this.subs[subId];
    // TODO: does the following note still apply to us?
    // sub could be null if logout and in really quickly
    if (!sub) { return; }
    if (sub.dataIds[id]) {
      sub.movedBefore(id, before);
    } else {
      let doc = memoizedFind(id);
      sub.addedBefore(id, R.omit(['_id'], doc), before);
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
