'use strict';

const _ = require('lodash');
const bodyParser = require('body-parser');
const domain = require('domain');
const express = require('express');
const Promise = require('bluebird');
const Reflect = require('core-js/library/es6/reflect');
const slurp = require('./lib/slurp');

const createServer = _.memoize(function createServer(port) {
    const app = express();

    app.listen(port, '0.0.0.0', function () {
        console.log('Express server listening on port %d', port);
    });

    app.use(bodyParser.json());

    app.get('/', (req, res, next) => res.send('lol'));

    return function (name, handler) {
        app.post(`/${name}`, handler);
    };
});

function createDispatch(dispatch) {
    return function (req, res, next) {
        console.log(req.headers);
        const routingKey = req.body.routingKey;
        const transactionId = req.body.transactionId;
        const args = req.body.args;

        return dispatch(routingKey, transactionId, args)
            .then(function (data) {
                res.status(200).send(data);
            })
            .catch(function (error) {
                res.status(500).send(error);
            });
    }
}

class Service {
    constructor(data) {
        this.data = slurp(data);
    }

    dispatch(path, transactionId, args) {
        console.log(path, transactionId, args);
        const service = this;

        return Promise.try(function () {
            const subPath = path.split('.').slice(1).join('.');

            const fn = _.get(service.data, subPath);

            if (!_.isFunction(fn)) {
                const functionName = subPath.split('.').slice(1).join('.');
                const serviceName = subPath.split('.')[0];

                throw new Error(`Function ${functionName} does not exist in service ${serviceName}`);
            }

            const ctx = domain.create();

            return new Promise(function (resolve, reject) {
                ctx.run(function () {
                    domain.active.transactionId = transactionId;

                    resolve(Reflect.apply(fn, service, args));
                });

                ctx.on('error', reject);
            });
        });
    }

    listen(port, name) {
        if (!name) {
            // arrow function to keep `this` binding... You're welcome, Aaron!
            return Promise.resolve(_.mapValues(this.data, (value, serviceName) => this.listen(port, serviceName)));
        }

        if (_.isArray(name)) {
            return Promise.map(name, (serviceName) => this.listen(port, serviceName));
        }

        console.log(`Listening on service ${name}...`);

        const routingListenKey = `fpp.${name}.#`;

        const dispatch = _.bind(this.dispatch, this);

        const service = createServer(port)(name, createDispatch(dispatch));

        return new Promise(_.noop);
    }
};

module.exports = Service;
