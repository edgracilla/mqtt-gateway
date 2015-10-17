'use strict';

var _        = require('lodash'),
	host     = require('ip').address(),
	mosca    = require('mosca'),
	platform = require('./platform'),
	server, qos;

/*
 * Listen for the message event.
 */
platform.on('message', function (message) {
	server.publish({
		topic: message.client,
		payload: message.message,
		messageId: message.messageId,
		qos: qos,
		retain: false
	}, function () {
		platform.sendMessageResponse(message.messageId, 'Message Published');
	});
});

/*
 * Listen for the ready event.
 */
platform.once('ready', function (options, registeredDevices) {
	qos = parseInt(options.qos);
	var devices = _.indexBy(registeredDevices, '_id');

	server = new mosca.Server({
		host: host,
		port: options.port
	});

	server.on('clientConnected', function (client) {
		platform.notifyConnection(client.id);
	});

	server.on('clientDisconnected', function (client) {
		platform.notifyDisconnection(client.id);
	});

	server.on('published', function (message, client) {
		if (message.topic === options.data_topic)
			platform.processData(client.id, message.payload.toString());
	});

	server.on('delivered', function (message) {
		platform.sendMessageResponse(message.messageId, 'Message Acknowledged');
	});

	server.on('ready', function () {
		server.authorizePublish = function (client, topic, payload, callback) {
			callback(null, !_.isEmpty(devices[client.id]));
		};

		server.authorizeSubscribe = function (client, topic, callback) {
			callback(null, !_.isEmpty(devices[client.id]));
		};

		server.authorizeForward = function (client, packet, callback) {
			callback(null, !_.isEmpty(devices[client.id]));
		};

		platform.notifyReady();
	});
});