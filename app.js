'use strict'

const reekoh = require('reekoh')
const plugin = new reekoh.plugins.Gateway()

const async = require('async')
const isEmpty = require('lodash.isempty')

let qos = null
let server = null

plugin.once('ready', () => {
  let map = require('lodash.map')
  let trim = require('lodash.trim')
  let uniq = require('lodash.uniq')
  let keyBy = require('lodash.keyby')
  let mosca = require('mosca')
  let config = require('./config.json')

  let options = plugin.config

  if (options.qos === 0 || isEmpty(options.qos)) {
    qos = 0
  } else {
    qos = parseInt(options.qos)
  }

  let dataTopic = options.dataTopic || config.dataTopic.default
  let commandTopic = options.commandTopic || config.commandTopic.default

  let tmpTopics = [dataTopic, commandTopic]
  let authorizedTopics = options.authorizedTopics

  if (!isEmpty(authorizedTopics)) {
    authorizedTopics = tmpTopics.concat(authorizedTopics.split(','))
  } else {
    authorizedTopics = tmpTopics
  }

  authorizedTopics = map(authorizedTopics, trim)
  authorizedTopics = keyBy(uniq(authorizedTopics))

  server = new mosca.Server({
    port: options.port
  })

  server.once('error', function (error) {
    console.error('MQTT Gateway Error', error)
    plugin.logException(error)

    setTimeout(() => {
      server.close(() => {
        server.removeAllListeners()
        process.exit()
      })
    }, 5000)
  })

  server.once('ready', () => {
    if (!isEmpty(options.user) && !isEmpty(options.password)) {
      server.authenticate = (client, username, password, callback) => {
        username = (!isEmpty(username)) ? username.toString() : ''
        password = (!isEmpty(password)) ? password.toString() : ''

        if (options.user === username && options.password === password) {
          return callback(null, true)
        } else {
          plugin.log(`MQTT Gateway - Authentication Failed on Client: ${(!isEmpty(client)) ? client.id : 'No Client ID'}.`)
          callback(null, false)
        }
      }
    }

    server.authorizePublish = (client, topic, payload, callback) => {
      plugin.requestDeviceInfo(client.id).then((deviceInfo) => {
        let isAuthorized = !isEmpty(deviceInfo) || topic === client.id || !isEmpty(authorizedTopics[topic])

        if (!isAuthorized) {
          return plugin.logException(new Error(`Device ${client.id} is not authorized to publish to topic ${topic}. Device not registered.`))
            .then(() => callback(null, false))
        }

        return callback(null, isAuthorized) || null
      }).catch((err) => {
        console.log(err)
        plugin.logException(err)

        if (err.message === 'Request for device information has timed out.') {
          callback(null, false)
        }
      })
    }

    server.authorizeSubscribe = (client, topic, callback) => {
      plugin.requestDeviceInfo(client.id).then((deviceInfo) => {
        let isAuthorized = !isEmpty(deviceInfo) || topic === client.id || !isEmpty(authorizedTopics[topic])

        if (!isAuthorized) {
          return plugin.logException(new Error(`Device ${client.id} is not authorized to subscribe to topic ${topic}. Device not registered.`))
            .then(() => callback(null, false))
        }

        return callback(null, isAuthorized) || null
      }).catch((err) => {
        console.log(err)
        plugin.logException(err)

        if (err.message === 'Request for device information has timed out.') {
          callback(null, false)
        }
      })
    }

    server.authorizeForward = (client, packet, callback) => {
      plugin.requestDeviceInfo(client.id).then((deviceInfo) => {
        let isAuthorized = !isEmpty(deviceInfo)

        if (!isAuthorized) {
          return plugin.logException(new Error(`Device ${client.id} is not authorized to forward messages. Device not registered.`))
            .then(() => callback(null, false))
        }

        return callback(null, isAuthorized) || null
      }).catch((err) => {
        console.log(err)
        plugin.logException(err)

        if (err.message === 'Request for device information has timed out.') {
          callback(null, false)
        }
      })
    }

    plugin.log(`MQTT Gateway initialized on port ${options.port}`)
    plugin.emit('init')
  })

  server.once('closed', () => {
    plugin.log(`MQTT Gateway closed on port ${options.port}`)
  })

  server.on('clientConnected', (client) => {
    plugin.log(`MQTT Gateway Device Connection received. Device ID: ${client.id}`)
    plugin.notifyConnection(client.id)
  })

  server.on('clientDisconnected', (client) => {
    plugin.log(`MQTT Gateway Device Disconnection received. Device ID: ${client.id}`)
    plugin.notifyDisconnection(client.id)
  })

  server.on('published', (message, client) => {
    let rawMessage = message.payload.toString()

    if (message.topic === dataTopic) {
      async.waterfall([
        async.constant(rawMessage || '{}'),
        async.asyncify(JSON.parse)
      ], (error, data) => {
        if (error || isEmpty(data)) {
          server.publish({
            topic: client.id,
            payload: `Invalid data sent. Data must be a valid JSON String. Raw Message: ${rawMessage}\n`,
            qos: 0,
            retain: false
          })

          return plugin.log(new Error(`Invalid data sent. Data must be a valid JSON String. Raw Message: ${rawMessage}`))
        }

        plugin.pipe(data).then(() => {
          server.publish({
            topic: client.id,
            payload: `Data Received. Device ID: ${client.id}. Data: ${rawMessage}\n`,
            qos: 0,
            retain: false
          })

          return plugin.log(JSON.stringify({
            title: 'MQTT Gateway - Data Received',
            device: client.id,
            data: data
          }))
        }).catch((err) => {
          console.log(err)
          plugin.logException(err)
        })
      })
    } else if (message.topic === commandTopic) {
      async.waterfall([
        async.constant(rawMessage || '{}'),
        async.asyncify(JSON.parse)
      ], (error, msg) => {
        if (error || isEmpty(msg.device) || isEmpty(msg.command)) {
          server.publish({
            topic: client.id,
            payload: 'Invalid message or command. Message must be a valid JSON String with "device" and "message" fields. "device" is a registered Device ID. "message" is the payload.\n',
            qos: 0,
            retain: false
          })

          return plugin.logException(new Error('Invalid message or command. Message must be a valid JSON String with "device" and "message" fields. "device" is a registered Device ID. "message" is the payload.'))
        }

        plugin.relayCommand(msg.command, msg.device, msg.deviceGroup).then(() => {
          server.publish({
            topic: client.id,
            payload: `Message Received. Device ID: ${client.id}. Message: ${rawMessage}\n`,
            qos: qos,
            retain: false
          })

          return plugin.log(JSON.stringify({
            title: 'MQTT Gateway - Message Received',
            source: client.id,
            target: msg.device,
            message: msg
          }))
        }).catch((err) => {
          console.log(err)
          plugin.logException(err)
        })
      })
    }
  })
})

plugin.on('command', (msg) => {
  server.publish({
    topic: msg.device,
    payload: msg.command,
    commandId: msg.commandId,
    qos: qos,
    retain: false
  }, () => {
    plugin.sendCommandResponse(msg.commandId, 'Command Sent').then(() => {
      plugin.log(JSON.stringify({
        title: 'Command Sent',
        device: msg.device,
        commandId: msg.commandId,
        command: msg.command
      }))

      setTimeout(() => {
        plugin.emit('response.ok')
      }, 500)
    })
  })
})

module.exports = plugin
