'use strict';

const _ = require('lodash');
const createChannel = require('@osufpp/service-transport');
const logger = require('@osufpp/logger');
const Promise = require('bluebird');
const Reflect = require('core-js/library/es6/reflect');
const serializerr = require('serializerr');

class Service {
    constructor(data) {
        this.data = data;
    }

    dispatch(path, args) {
        return Promise.try(function () {
            const subPath = path.split('.').slice(1).join('.');

            const fn = _.get(this.data, subPath);

            if (!_.isFunction(fn)) {
                const functionName = subPath.split('.').slice(1).join('.');
                const serviceName = subPath.split('.')[0];

                throw new Error(`Function ${functionName} does not exist in service ${serviceName}`);
            }

            return Reflect.apply(fn, this, args);
        }.bind(this));
    }

    listen(name) {
        if (!name) {
            return Promise.resolve(_.mapValues(this.data, (value, serviceName) => this.listen(serviceName)));
        }

        if (_.isArray(name)) {
            return Promise.map(name, (serviceName) => this.listen(serviceName));
        }

        console.log(`Listening on service ${name}...`);

        const routingListenKey = `fpp.${name}.#`;

        const dispatch = _.bind(this.dispatch, this);

        return Promise.using(createChannel(), Promise.coroutine(function *(ch) {
            const ex = yield ch.assertExchange('fpp', 'topic', { durable: false });

            const q = yield ch.assertQueue(routingListenKey);

            yield ch.bindQueue(q.queue, ex.exchange, routingListenKey);

            ch.consume(q.queue, function (msg) {
                const replyTo = msg.properties.replyTo;
                const correlationId = msg.properties.correlationId;
                const routingKey = msg.fields.routingKey;

                return dispatch(routingKey, JSON.parse(msg.content.toString('utf8')))
                    .then(function (data) {
                        const success = true;

                        return ch.sendToQueue(
                            replyTo,
                            new Buffer(JSON.stringify(data)),
                            { correlationId, headers: { success } }
                        );
                    })
                    .catch(function (error) {
                        const success = false;

                        return ch.sendToQueue(
                            replyTo,
                            new Buffer(JSON.stringify(serializerr(error))),
                            { correlationId, headers: { success } }
                        );
                    })
                    .finally(function () {
                        ch.ack(msg);
                    });
            }, { noAck: false });

            // TODO: do we ever want this to resolve?
            return new Promise(function (resolve, reject) {

            });
        }));
    }
};

module.exports = Service;
