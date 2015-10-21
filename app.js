'use strict';

var mosca    = require('mosca'),
	platform = require('./platform'),
	devices  = {},
	server, qos;

/*
 * Listen for the message event.
 */
platform.on('message', function (message) {
	server.publish({
		topic: message.device,
		payload: message.message,
		messageId: message.messageId,
		qos: qos,
		retain: false
	}, function () {
		platform.sendMessageResponse(message.messageId, 'Message Published');
		platform.log(JSON.stringify({
			title: 'Message Published',
			device: message.device,
			messageId: message.messageId,
			message: message.message
		}));
	});
});

/*
 * When a new device is added, add it to the list of authorized devices.
 */
platform.on('adddevice', function (device) {
	var _ = require('lodash');

	if (!_.isEmpty(device) && !_.isEmpty(device._id)) {
		devices[device._id] = device;
		platform.log('Successfully added ' + device._id + ' to the pool of authorized devices.');
	}
	else
		platform.handleException(new Error('Device data invalid. Device not added. ' + device));
});

/*
 * When a device is removed or deleted, remove it from the list of authorized devices.
 */
platform.on('removedevice', function (device) {
	var _ = require('lodash');

	if (!_.isEmpty(device) && !_.isEmpty(device._id)) {
		delete devices[device._id];
		platform.log('Successfully removed ' + device._id + ' from the pool of authorized devices.');
	}
	else
		platform.handleException(new Error('Device data invalid. Device not removed. ' + device));
});

/*
 * Event to listen to in order to gracefully release all resources bound to this service.
 */
platform.on('close', function () {
	server.close();
});

/*
 * Listen for the ready event.
 */
platform.once('ready', function (options, registeredDevices) {
	var _      = require('lodash'),
		isJSON = require('is-json'),
		config = require('./config.json');

	if (options.qos === 0 || _.isEmpty(options.qos))
		qos = 0;
	else
		qos = parseInt(options.qos);

	if (!_.isEmpty(registeredDevices)) {
		var tmpDevices = _.clone(registeredDevices, true);

		devices = _.indexBy(tmpDevices, '_id');
	}

	var dataTopic = options.data_topic || config.data_topic.default;
	var messageTopic = options.message_topic || config.message_topic.default;
	var groupMessageTopic = options.groupmessage_topic || config.groupmessage_topic.default;

	var tmpTopics = [dataTopic, messageTopic, groupMessageTopic];
	var authorizedTopics = options.authorized_topics;

	if (!_.isEmpty(authorizedTopics))
		authorizedTopics = tmpTopics.concat(authorizedTopics.split(','));
	else
		authorizedTopics = tmpTopics;

	authorizedTopics = _.map(authorizedTopics, _.trim);
	authorizedTopics = _.indexBy(_.uniq(authorizedTopics));

	server = new mosca.Server({
		port: options.port
	});

	server.on('clientConnected', function (client) {
		platform.notifyConnection(client.id);
	});

	server.on('clientDisconnected', function (client) {
		platform.notifyDisconnection(client.id);
	});

	server.on('published', function (message, client) {
		var msg = message.payload.toString();

		if (message.topic === options.data_topic) {
			platform.processData(client.id, msg);
			platform.log(JSON.stringify({
				title: 'Data Received.',
				device: client.id,
				data: msg
			}));
		}
		else if (message.topic === options.message_topic) {
			if (isJSON(msg)) {
				msg = JSON.parse(msg);

				platform.sendMessageToDevice(msg.target, msg.message);
				platform.log(JSON.stringify({
					title: 'Message Sent.',
					source: client.id,
					target: msg.target,
					message: msg
				}));
			}
		}
		else if (message.topic === options.groupmessage_topic) {
			if (isJSON(msg)) {
				msg = JSON.parse(msg);

				platform.sendMessageToGroup(msg.target, msg.message);
				platform.log(JSON.stringify({
					title: 'Group Message Sent.',
					source: client.id,
					target: msg.target,
					message: msg
				}));
			}
		}
	});

	server.on('delivered', function (message) {
		platform.sendMessageResponse(message.messageId, 'Message Acknowledged');
	});

	server.on('closed', function () {
		platform.notifyClose();
	});

	server.on('ready', function () {
		server.authorizePublish = function (client, topic, payload, callback) {
			return callback(null, !_.isEmpty(devices[client.id]) || topic === client.id || !_.isEmpty(authorizedTopics[topic]));
		};

		server.authorizeSubscribe = function (client, topic, callback) {
			return callback(null, !_.isEmpty(devices[client.id]) || topic === client.id || !_.isEmpty(authorizedTopics[topic]));
		};

		server.authorizeForward = function (client, packet, callback) {
			return callback(null, !_.isEmpty(devices[client.id]));
		};

		platform.notifyReady();
	});
});
