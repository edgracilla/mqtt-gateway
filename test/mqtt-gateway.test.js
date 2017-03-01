/* global describe, it, after, before */
'use strict'

const mqtt = require('mqtt')
const async = require('async')
const amqp = require('amqplib')
const should = require('should')
const isEmpty = require('lodash.isempty')

const Broker = require('../node_modules/reekoh/lib/broker.lib')

const PORT = 8182
const PLUGIN_ID = 'demo.gateway'
const BROKER = 'amqp://guest:guest@127.0.0.1/'
const OUTPUT_PIPES = 'demo.outpipe1,demo.outpipe2'
const COMMAND_RELAYS = 'demo.relay1,demo.relay2'

const DEVICE_ID1 = '567827489028375'
const DEVICE_ID2 = '567827489028376'

let conf = {
  qos: 0,
  port: PORT
}

let _app = null
let _conn = null
let _broker = null
let _channel = null

let mqttClient1 = null
let mqttClient2 = null

describe('MQTT Gateway', () => {
  before('init', function () {
    process.env.BROKER = BROKER
    process.env.PLUGIN_ID = PLUGIN_ID
    process.env.OUTPUT_PIPES = OUTPUT_PIPES
    process.env.COMMAND_RELAYS = COMMAND_RELAYS
    process.env.CONFIG = JSON.stringify(conf)

    _broker = new Broker()

    amqp.connect(BROKER).then((conn) => {
      _conn = conn
      return conn.createChannel()
    }).then((channel) => {
      _channel = channel
    }).catch((err) => {
      console.log(err)
    })
  })

  after('terminate', function () {
    _conn.close()
    mqttClient1.end(true)
    mqttClient2.end(true)

    setTimeout(function () {
      _app.kill('SIGKILL')
    }, 4500)
  })

  describe('#start', function () {
    it('should start the app', function (done) {
      this.timeout(10000)
      _app = require('../app')
      _app.once('init', done)
    })
  })

  describe('#connections', function () {
    it('should accept connections', function (done) {
      mqttClient1 = mqtt.connect('mqtt://localhost' + ':' + PORT, {
        clientId: DEVICE_ID1
      })

      mqttClient2 = mqtt.connect('mqtt://localhost' + ':' + PORT, {
        clientId: DEVICE_ID2
      })

      async.parallel([
        function (cb) {
          mqttClient1.on('connect', cb)
        },
        function (cb) {
          mqttClient2.on('connect', cb)
        }
      ], function () {
        done()
      })
    })
  })

  describe('#test RPC preparation', () => {
    it('should connect to broker', (done) => {
      _broker.connect(BROKER).then(() => {
        return done() || null
      }).catch((err) => {
        done(err)
      })
    })

    it('should spawn temporary RPC server', (done) => {
      // if request arrives this proc will be called
      let sampleServerProcedure = (msg) => {
        return new Promise((resolve, reject) => {
          async.waterfall([
            async.constant(msg.content.toString('utf8')),
            async.asyncify(JSON.parse)
          ], (err, parsed) => {
            if (err) return reject(err)
            parsed.foo = 'bar'
            resolve(JSON.stringify(parsed))
          })
        })
      }

      _broker.createRPC('server', 'deviceinfo').then((queue) => {
        return queue.serverConsume(sampleServerProcedure)
      }).then(() => {
        // Awaiting RPC requests
        done()
      }).catch((err) => {
        done(err)
      })
    })
  })

  describe('#clients', function () {
    it('should relay messages', function (done) {
      this.timeout(10000)

      mqttClient2.subscribe([DEVICE_ID2])

      mqttClient2.once('message', (topic, msg) => {
        should.ok(msg.toString().startsWith('Data Received.'))
        done()
      })

      mqttClient1.subscribe(['reekoh/data'], function (error) {
        should.ifError(error)
        mqttClient2.publish('reekoh/data', '{"foo":"bar"}')
      })
    })
  })

  describe('#command', function () {
    it('should create commandRelay listener', function (done) {
      this.timeout(10000)

      let cmdRelays = `${COMMAND_RELAYS || ''}`.split(',').filter(Boolean)

      async.each(cmdRelays, (cmdRelay, cb) => {
        _channel.consume(cmdRelay, (msg) => {
          if (!isEmpty(msg)) {
            async.waterfall([
              async.constant(msg.content.toString('utf8') || '{}'),
              async.asyncify(JSON.parse)
            ], (err, obj) => {
              if (err) return console.log('parse json err. supplied invalid data')

              let devices = []

              if (Array.isArray(obj.devices)) {
                devices = obj.devices
              } else {
                devices.push(obj.devices)
              }

              if (obj.deviceGroup) {
                // get devices from platform agent
                // then push to devices[]
              }

              async.each(devices, (device, cb) => {
                _channel.publish('amq.topic', `${cmdRelay}.topic`, new Buffer(JSON.stringify({
                  sequenceId: obj.sequenceId,
                  commandId: new Date().getTime().toString(), // uniq
                  command: obj.command,
                  device: device
                })))
                cb()
              }, (err) => {
                should.ifError(err)
              })
            })

            // _channel.publish('amq.topic', `${cmdRelay}.topic`, new Buffer(msg.content.toString('utf8')))
          }
          _channel.ack(msg)
        }).then(() => {
          return cb()
        }).catch((err) => {
          should.ifError(err)
        })
      }, done)
    })

    it('should process the command and send it to the client', function (done) {
      mqttClient2.subscribe([DEVICE_ID1])

      mqttClient2.once('message', (topic, msg) => {
        should.ok(msg.toString().startsWith('Message Received.'))
        done()
      })

      mqttClient1.subscribe(['reekoh/commands'], function (error) {
        should.ifError(error)
        mqttClient2.publish('reekoh/commands', JSON.stringify({
          device: DEVICE_ID1,
          deviceGroup: '',
          command: 'DEACTIVATE'
        }))
      })
    })

    it('should be able to recieve command response', function (done) {
      this.timeout(5000)
      _app.once('response.ok', done)
    })
  })
})
