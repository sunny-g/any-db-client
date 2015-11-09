// polyfill for React Native
if (process.nextTick === undefined) {
  process.nextTick = setImmediate;
}

const MINKEY = 0;
const MIDKEY = 1073741824
const MAXKEY = 2147483648
let { U, R } = require('./utils.js');

module.exports = {
  parseDDPMsg: parseDDPMsg,
  findIndexById: findIndexById,
  changeDoc: changeDoc,
  newSortIndex: newSortIndex
};

// TODO: ANNOTATE THIS
/**
 * 
 */
function parseDDPMsg(data) {
  let id = parseId(data.id);
  // what do these fields look like
  data.fields = fields2Obj(data.fields);
  let positions = {};
  let cleared = {};
  // wtf is subobj
  let subObj = data.fields[this.DB_KEY];

  if (subObj) {
    for (let subId in subObj) {
      // wtf is subId and value???
      let value = subObj[subId];
      if (value === undefined) {
        cleared[subId] = true
      } else {
        let before = value.split('.')[1];
        if (before === 'null') { before = null }
        positions[subId] = before
      }
    }
  }
  let fields = R.clone(data.fields)
  delete fields[this.DB_KEY]
  return {
    id: id, 
    fields: fields,
    positions: positions,
    cleared: cleared
  };
}

/**
 * Finds index of a document by its _id property
 */
function findIndexById(id, docs) {
  for (let i = 0; i < docs.length; i++) {
    if (docs[i]._id === id) {
      return i;
    }
  }
  return -1;
}

/**
 * Returns a sortIndex either in between two other keys or at the end of the keys
 */
function newSortIndex(index, keyList) {
  if (index === null && keyList.length === 0) {
    // if first in list, return the MIDKEY
    return MIDKEY;
  } else if (index === null) {
    // if added to end, return a key between the last and the MAXKEY
    return ((keyList[keyList.length - 1].sortIndex / 2) | 0) +
      (((MAXKEY) / 2) | 0);
  } else {
    // if adding before an index, return a key between it's sortIndex and the the previous sortIndex
    let STARTKEY = keyList[index - 1] !== undefined ?
      STARTKEY = keyList[index - 1].sortIndex : MINKEY;
    return ((keyList[index].sortIndex / 2) | 0) + 
      ((STARTKEY / 2) | 0);
  }
}

/**
 * deep extends doc with fields, deletes undefined values
 */
function changeDoc(doc, fields) {
  return deleteUndefined(U.extendDeep(doc, fields));
}

/***********************************************/
/*                   helpers                   */
/***********************************************/

/**
 * Unflatten DDP fields into a deep object
 * e.g. any-db.1: value >> any-db: {1: value}
 */
function fields2Obj(fields) {
  fields = fields || {};
  fields = R.clone(fields);
  let dest = {};
  for (let key in fields) {
    let value = fields[key];
    let keys = key.split('.').reverse();
    if (keys.length === 1) {
      dest[key] = value;
    } else {
      let obj = {};
      let prevObj = obj;
      while (keys.length > 1) {
        let tmp = {};
        prevObj[keys.pop()] = tmp;
        prevObj = tmp;
      }
      prevObj[keys.pop()] = value;
      U.extendDeep(dest, obj);
    }
  }
  return dest;
}

function parseId(id) {
  if (id === '-') {
    return undefined;
  } else if (id.substr(0, 1) === '-') {
    return id.substr(1);
  } else if (id.substr(0, 1) === '~') {
    return JSON.parse(id.substr(1)).toString();
  } else {
    // if id === '' or something else entirely
    return id;
  }
}

/**
 * removes fields that are set to undefined
 */
function deleteUndefined(doc) {
  for (let key in doc) {
    let value = doc[key];
    if (U.isPlainObject(value)) {
      // why are we setting the key to undefined??
      doc[key] = deleteUndefined(value);
    } else if (value === undefined) {
      delete doc[key];
    }
  }
  return;
}
