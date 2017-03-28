/* global describe, it, after, before */
'use strict'

const mqtt = require('mqtt')
const async = require('async')
const should = require('should')

const PORT = 8182
const PLUGIN_ID = 'demo.gateway'
const BROKER = 'amqp://guest:guest@127.0.0.1/'
const OUTPUT_PIPES = 'demo.outpipe1,demo.outpipe2'
const COMMAND_RELAYS = 'demo.relay1,demo.relay2'

let conf = {
  qos: 0,
  port: PORT
}

let _app = null
let mqttClient1 = null
let mqttClient2 = null

describe('MQTT Gateway', () => {
  before('init', function () {
    process.env.BROKER = BROKER
    process.env.PLUGIN_ID = PLUGIN_ID
    process.env.OUTPUT_PIPES = OUTPUT_PIPES
    process.env.COMMAND_RELAYS = COMMAND_RELAYS
    process.env.CONFIG = JSON.stringify(conf)
  })

  after('terminate', function () {
    mqttClient1.end(true)
    mqttClient2.end(true)
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
        clientId: '567827489028375'
      })

      mqttClient2 = mqtt.connect('mqtt://localhost' + ':' + PORT, {
        clientId: '567827489028377'
      })

      async.parallel([
        (cb) => mqttClient1.on('connect', cb),
        (cb) => mqttClient2.on('connect', cb)
      ], function () {
        done()
      })
    })
  })

  describe('#clients', function () {
    it('should relay messages', function (done) {
      this.timeout(10000)

      mqttClient2.subscribe(['567827489028377'])

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

    it('should be able to send command (sent to offline device)', function (done) {
      mqttClient2.subscribe(['567827489028375'])

      mqttClient2.once('message', (topic, msg) => {
        should.ok(msg.toString().startsWith('Message Sent.'))
        done()
      })

      mqttClient2.publish('reekoh/commands', JSON.stringify({
        target: '567827489028376', // <-- offline device
        device: '567827489028375',
        deviceGroup: '',
        command: 'ACCIO'
      }))
    })

    it('should be able to recieve command response', function (done) {
      this.timeout(5000)

      _app.on('response.ok', (device) => {
        if (device === '567827489028375') done()
      })

      mqttClient1.publish('reekoh/commands', JSON.stringify({
        target: '567827489028375',
        device: '567827489028377',
        deviceGroup: '',
        command: 'DEACTIVATE'
      }))
    })

    // NOTE!!! below test requires device '567827489028376' to offline in mongo
    // NOTE!!! below test requires device '567827489028376' to offline in mongo
    // NOTE!!! below test requires device '567827489028376' to offline in mongo

    it('should be able to recieve offline commands (on boot)', function (done) {
      this.timeout(5000)

      let called = false
      let mqttClient3 = mqtt.connect('mqtt://localhost' + ':' + PORT, {clientId: '567827489028376'})

      mqttClient3.on('connect', (x) => {
        _app.on('response.ok', (device) => {
          if (!called && device === '567827489028376') {
            called = true
            done()
          }
        })
      })
    })


  })
})
