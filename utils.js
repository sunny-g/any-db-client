/********************************************/
/*     copied from ccorcos:meteor-utils     */
/* https://github.com/ccorcos/meteor-utils/ */
/********************************************/
let R = require('ramda');
let U = require('underscore');

U.unix = function() {
  return Math.round(Date.now() / 1000);
};

U.timestamp = function() {
  return Date.now();
};

U.stopwatch = function() {
  let start = U.timestamp();
  return function() {
    return (U.timestamp - start) / 1000;
  }
};

U.isPlainObject = function(x) {
  return Object.prototype.toString.apply(x) === '[object Object]';
};

U.extendDeep = R.curry(function(dest, obj) {
  for (let key in obj) {
    let value = obj[key];
    if (U.isPlainObject(value)) {
      dest[key] = dest[key] || {};
      U.extendDeep(dest[key], value);
    } else {
      dest[key] = value;
    }
  }
});

module.exports = { U, R };
