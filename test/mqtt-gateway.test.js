'use strict';

const HOST       = '0.0.0.0',
	  PORT       = 8080,
	  CLIENT_ID1 = '567827489028375',
	  CLIENT_ID2 = '567827489028376';

var cp     = require('child_process'),
	mqtt   = require('mqtt'),
	async  = require('async'),
	should = require('should'),
	mqttGateway, mqttClient1, mqttClient2;

describe('Gateway', function () {
	this.slow(5000);

	after('terminate child process', function () {
		this.timeout(5000);

		mqttClient1.end(true);
		mqttClient2.end(true);

		setTimeout(function () {
			mqttGateway.kill('SIGKILL');
		}, 4500);
	});

	describe('#spawn', function () {
		it('should spawn a child process', function () {
			should.ok(mqttGateway = cp.fork(process.cwd()), 'Child process not spawned.');
		});
	});

	describe('#handShake', function () {
		it('should notify the parent process when ready within 5 seconds', function (done) {
			this.timeout(5000);

			mqttGateway.on('message', function (message) {
				if (message.type === 'ready')
					done();
			});

			mqttGateway.send({
				type: 'ready',
				data: {
					options: {
						host: HOST,
						port: PORT,
						qos: '0'
					},
					devices: [{_id: CLIENT_ID1}, {_id: CLIENT_ID2}]
				}
			}, function (error) {
				should.ifError(error);
			});
		});
	});

	describe('#connections', function () {
		it('should accept connections', function (done) {
			mqttClient1 = mqtt.connect('mqtt://127.0.0.1' + ':' + PORT, {
				clientId: CLIENT_ID1
			});

			mqttClient2 = mqtt.connect('mqtt://127.0.0.1' + ':' + PORT, {
				clientId: CLIENT_ID2
			});

			async.parallel([
				function (cb) {
					mqttClient1.on('connect', cb);
				},
				function (cb) {
					mqttClient2.on('connect', cb);
				}
			], done);
		});
	});

	describe('#clients', function () {
		it('should relay messages', function (done) {
			mqttClient1.once('message', function (topic, message) {
				should.equal('reekoh/data', topic);
				should.equal('Sample Data', message.toString());

				return done();
			});

			mqttClient1.subscribe(['reekoh/data', CLIENT_ID1], function (error) {
				should.ifError(error);

				mqttClient2.publish('reekoh/data', 'Sample Data');
			});
		});
	});

	describe('#message', function () {
		it('should process the message and send it to the client', function (done) {
			mqttClient1.once('message', function (topic, message) {
				should.equal(CLIENT_ID1, topic);
				should.equal('Sample Command', message.toString());

				return done();
			});

			mqttGateway.send({
				type: 'message',
				data: {
					client: CLIENT_ID1,
					messageId: '55fce1455167c470abeedae2',
					message: 'Sample Command'
				}
			});
		});
	});
});