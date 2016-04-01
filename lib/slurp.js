'use strict';

const _ = require('lodash');

// merge properties named 'index' with its parent
module.exports = function slurp(d) {
    return _.mapValues(d, function (val, key) {
        if (_.isFunction(val)) {
            return val;
        }

        if (val && _.isObject(val.index)) {
            val = _.merge(val.index, val);
        }

        return slurp(_.omit(val, 'index'));
    });
};
