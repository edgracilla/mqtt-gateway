'use strict';

var isEmpty           = require('lodash.isempty'),
	platform          = require('./platform'),
	authorizedDevices = {},
	server, port, qos;

/*
 * Listen for the message event.
 */
platform.on('message', (message) => {
	server.publish({
		topic: message.device,
		payload: message.message,
		messageId: message.messageId,
		qos: qos,
		retain: false
	}, () => {
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
platform.on('adddevice', (device) => {
	if (!isEmpty(device) && !isEmpty(device._id)) {
		authorizedDevices[device._id] = device;
		platform.log('Successfully added ' + device._id + ' to the pool of authorized devices.');
	}
	else
		platform.handleException(new Error('Device data invalid. Device not added. ' + device));
});

/*
 * When a device is removed or deleted, remove it from the list of authorized devices.
 */
platform.on('removedevice', (device) => {
	if (!isEmpty(device) && !isEmpty(device._id)) {
		delete authorizedDevices[device._id];
		platform.log('Successfully removed ' + device._id + ' from the pool of authorized devices.');
	}
	else
		platform.handleException(new Error('Device data invalid. Device not removed. ' + device));
});

/*
 * Event to listen to in order to gracefully release all resources bound to this service.
 */
platform.on('close', () => {
	let d = require('domain').create();

	d.once('error', (error) => {
		console.error('Error closing MQTT Gateway on port ' + port, error);
		platform.handleException(error);
		platform.notifyClose();
		d.exit();
	});

	d.run(() => {
		server.close();
		d.exit();
	});
});

/*
 * Listen for the ready event.
 */
platform.once('ready', function (options, registeredDevices) {
	var map    = require('lodash.map'),
		trim   = require('lodash.trim'),
		uniq   = require('lodash.uniq'),
		keyBy  = require('lodash.keyby'),
		mosca  = require('mosca'),
		domain = require('domain'),
		config = require('./config.json');

	if (options.qos === 0 || isEmpty(options.qos))
		qos = 0;
	else
		qos = parseInt(options.qos);

	if (!isEmpty(registeredDevices))
		authorizedDevices = keyBy(registeredDevices, '_id');

	var dataTopic = options.data_topic || config.data_topic.default;
	var messageTopic = options.message_topic || config.message_topic.default;
	var groupMessageTopic = options.groupmessage_topic || config.groupmessage_topic.default;

	var tmpTopics = [dataTopic, messageTopic, groupMessageTopic];
	var authorizedTopics = options.authorized_topics;

	if (!isEmpty(authorizedTopics))
		authorizedTopics = tmpTopics.concat(authorizedTopics.split(','));
	else
		authorizedTopics = tmpTopics;

	authorizedTopics = map(authorizedTopics, trim);
	authorizedTopics = keyBy(uniq(authorizedTopics));

	port = options.port;
	server = new mosca.Server({
		port: port
	});

	server.on('clientConnected', (client) => {
		platform.notifyConnection(client.id);
	});

	server.on('clientDisconnected', (client) => {
		platform.notifyDisconnection(client.id);
	});

	server.on('published', (message, client) => {
		let msg = message.payload.toString();

		if (message.topic === dataTopic) {
			var d0 = domain.create();

			d0.once('error', () => {
				platform.log(new Error('Invalid message received. Raw Message: ' + msg));
				d0.exit();
			});

			d0.run(() => {
				JSON.parse(msg);

				platform.processData(client.id, msg);
				platform.log(JSON.stringify({
					title: 'Data Received.',
					device: client.id,
					data: msg
				}));

				d0.exit();
			});
		}
		else if (message.topic === messageTopic) {
			var d1 = domain.create();

			d1.once('error', () => {
				platform.log(new Error('Invalid message received. Raw Message: ' + msg));
				d1.exit();
			});

			d1.run(() => {
				msg = JSON.parse(msg);

				platform.sendMessageToDevice(msg.target, msg.message);
				platform.log(JSON.stringify({
					title: 'Message Sent.',
					source: client.id,
					target: msg.target,
					message: msg
				}));

				d1.exit();
			});
		}
		else if (message.topic === groupMessageTopic) {
			var d2 = domain.create();

			d2.once('error', () => {
				platform.log(new Error('Invalid group message received. Raw Message: ' + msg));
				d2.exit();
			});

			d2.run(() => {
				msg = JSON.parse(msg);

				platform.sendMessageToGroup(msg.target, msg.message);
				platform.log(JSON.stringify({
					title: 'Group Message Sent.',
					source: client.id,
					target: msg.target,
					message: msg
				}));

				d2.exit();
			});
		}
	});

	server.on('delivered', (message) => {
		platform.sendMessageResponse(message.messageId, 'Message Acknowledged');
	});

	server.on('closed', () => {
		console.log('MQTT Gateway closed on port ' + port);
		platform.notifyClose();
	});

	server.on('error', (error) => {
		console.error('Server Error', error);
		platform.handleException(error);

		if (error.code === 'EADDRINUSE')
			process.exit(1);
	});

	server.on('ready', () => {
		server.authorizePublish = (client, topic, payload, callback) => {
			return callback(null, !isEmpty(authorizedDevices[client.id]) || topic === client.id || !isEmpty(authorizedTopics[topic]));
		};

		server.authorizeSubscribe = (client, topic, callback) => {
			return callback(null, !isEmpty(authorizedDevices[client.id]) || topic === client.id || !isEmpty(authorizedTopics[topic]));
		};

		server.authorizeForward = (client, packet, callback) => {
			return callback(null, !isEmpty(authorizedDevices[client.id]));
		};

		platform.log('MQTT Gateway initialized on port ' + port);
		platform.notifyReady();
	});
});
