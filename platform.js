'use strict';

var inherits     = require('util').inherits,
	EventEmitter = require('events').EventEmitter;

var isString = function (val) {
	return typeof val === 'string' || ((!!val && typeof val === 'object') && Object.prototype.toString.call(val) === '[object String]');
};

function Platform() {
	if (!(this instanceof Platform)) return new Platform();

	var self = this;

	process.on('uncaughtException', function (error) {
		self.handleException(error);
		process.exit(1);
	});

	EventEmitter.call(this);
	Platform.init.call(this);
}

inherits(Platform, EventEmitter);

Platform.init = function () {
	var self = this;

	process.on('message', function (m) {
		if (m.type === 'ready')
			self.emit('ready', m.data.options, m.data.devices);
		else if (m.type === 'message')
			self.emit('message', m.data);
	});
};

Platform.prototype.notifyReady = function (callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		process.send({
			type: 'ready'
		});

		callback();
	});
};

Platform.prototype.notifyConnection = function (clientId, callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		if (!clientId || !isString(clientId)) return callback(new Error('A valid client identifier is required.'));

		process.send({
			type: 'connection',
			data: clientId
		});

		callback();
	});
};

Platform.prototype.notifyDisconnection = function (clientId, callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		if (!clientId || !isString(clientId)) return callback(new Error('A valid client identifier is required.'));

		process.send({
			type: 'disconnect',
			data: clientId
		});

		callback();
	});
};

Platform.prototype.notifyClose = function (callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		process.send({
			type: 'close'
		});

		callback();
	});
};

Platform.prototype.processData = function (device, data, callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		if (!device || !isString(device)) return callback(new Error('A valid device id is required.'));
		if (!data || !isString(data)) return callback(new Error('A valid data is required.'));

		process.send({
			type: 'data',
			data: {
				device: device,
				data: data
			}
		});

		callback();
	});
};

Platform.prototype.sendMessageResponse = function (messageId, response, callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		if (!messageId || !isString(messageId)) return callback(new Error('A valid message id is required.'));
		if (!response || !isString(response)) return callback(new Error('A valid response is required.'));

		process.send({
			type: 'response',
			data: {
				messageId: messageId,
				response: response
			}
		});

		callback();
	});
};

Platform.prototype.sendMessageToDevice = function (device, message, callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		if (!device || !isString(device)) return callback(new Error('A valid device id is required.'));
		if (!message || !isString(message)) return callback(new Error('A valid message is required.'));

		process.send({
			type: 'message',
			data: {
				device: device,
				message: message
			}
		});

		callback();
	});
};

Platform.prototype.sendMessageToGroup = function (group, message, callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		if (!group || !isString(group)) return callback(new Error('A valid group id is required.'));
		if (!message || !isString(message)) return callback(new Error('A valid message is required.'));

		process.send({
			type: 'message',
			data: {
				group: group,
				message: message
			}
		});

		callback();
	});
};

Platform.prototype.log = function (title, description, callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		if (!title || !isString(title)) return callback(new Error('A valid log title is required.'));

		process.send({
			type: 'log',
			data: {
				title: title,
				description: description
			}
		});

		callback();
	});
};

Platform.prototype.handleException = function (error, callback) {
	callback = callback || function () {
		};

	setImmediate(function () {
		if (!error) return callback(new Error('Error is required.'));

		process.send({
			type: 'error',
			data: {
				name: error.name,
				message: error.message,
				stack: error.stack
			}
		});
	});
};

module.exports = new Platform();
