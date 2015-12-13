'use strict'

const events = require('events')
const net = require('net')

const $client = Symbol('client')
const $netOpts = Symbol('netOpts')
const $queue = Symbol('queue')

// FIXME: Why can we not inherit from events?
class MPClient {

  /**
   * @param {Object} netOpts Options that are passed to net.connect
   *
   * @see https://nodejs.org/api/net.html#net_net_connect_options_connectlistener
   */
  constructor(netOpts) {
    this[$client] = null
    this[$netOpts] = netOpts
    this[$queue] = []

    Object.defineProperty(this, 'events', {
      configurable: false,
      enumerable: true,
      value: new events(),
      writable: false,
    })
  }

  /**
   * Connects to the MPD server.
   *
   * If already connected, the existing connection is ended first.
   *
   * @return {Promise}
   */
  connect() {
    return new Promise((resolve, reject) => {
      // clean up the old client
      if (this[$client] != null) {
        this.disconnect()
      }

      this[$client] = net.connect(this[$netOpts], () => this.events.on('ready', resolve))
      this[$client].setEncoding('utf8')

      this[$client].on('error', (err) => this.events.emit(err))

      let buffer = ''
      this[$client].on('data', (data) => {
        data = buffer + data
        buffer = ''

        let prev = 0
        let nl = 1 + data.indexOf('\n', prev)
        while (nl !== 0) {
          const line = data.substring(prev, nl)
          prev = nl
          nl = 1 + data.indexOf('\n', prev)

          const isOK = line.startsWith('OK')
          const isACK = line.startsWith('ACK')

          if (isOK || isACK) {
            if (isOK && line.startsWith('OK MPD')) {
              this.events.emit('ready', buffer + line)
              buffer = ''
            }
            else {
              const response = _parseResponse(buffer, line)
              buffer = ''

              this.events.emit('response', response)

              if (this[$queue].length) {
                // TODO (es6): const [resolve, reject] = this[$queue].shift()
                const cbs = this[$queue].shift()
                const resolve = cbs[0]
                const reject = cbs[1]

                if (isOK) {
                  resolve(response)
                }
                else {
                  reject(response)
                }
              }
            }
          }
          else {
            buffer += line
          }
        }

        buffer += data.substring(prev)
      })
    })
  }

  /**
   * Ends the current connection.
   */
  disconnect() {
    if (this[$client] != null) {
      this[$client].end()
      this[$client] = null
    }
  }

  /**
   * Sends a command to MPD and waits for an answer.
   *
   * @param {String} command
   * @return {Promise}
   *
   * @see http://www.musicpd.org/doc/protocol/command_reference.html
   */
  command(command) {
    return new Promise((resolve, reject) => {
      if (this[$client] == null) {
        reject(new Error('No active connection to write to.'))
        return
      }

      // TODO: Is there a possibility that this could insert commands in
      //       the queue in the wrong order?
      // TODO: Should we apply escaping to `command`?
      this[$client].write(command + '\n', 'utf8', () => this[$queue].push([resolve, reject]))
    })
  }

}

exports = module.exports = MPClient


/**
 * Helper function to parse MPD responses.
 *
 * @param {String} contents The response content.
 * @param {String} status   The status line at the end of the response.
 * @return {Object}
 */
function _parseResponse(contents, status) {
  let data = {}

  if (contents) {
    for (const line of contents.split('\n')) {
      if (!line) continue

      const i = line.indexOf(': ')

      if (i === -1) {
        data = {}
        break
      }

      data[line.substring(0, i)] = line.substring(i + 2)
    }
  }

  return {
    data: data,
    status: status.replace('\n', ''),
    full: contents + status,
  }
}
